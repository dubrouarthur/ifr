import { describe, expect, it } from "vitest";
import { Sim } from "../src/sim/sim";
import { applyScene } from "../src/course/scene";
import { sceneOfSituation, defaultSituation } from "../src/course/situations";
import {
  applyMirror,
  canClimb,
  canDescend,
  clampAxis,
  climbTarget,
  demoFailures,
  demoKey,
  DemoPilot,
  descendTarget,
  dw,
  entryId,
  hintDue,
  mirrorOf,
  setAxis,
  slideFailures,
  slideSceneId,
  targetsOf,
  turnTarget,
} from "../src/course/ui/demoPilot";
import {
  isPresentWire,
  presentLink,
  PRESENT_CHANNEL,
  type PresentWire,
} from "../src/course/present";
import type { Course, Step } from "../src/course/types";

function simAt(over: Partial<ReturnType<typeof defaultSituation>> = {}): Sim {
  const sim = new Sim();
  applyScene(
    sim,
    sceneOfSituation({ ...defaultSituation(), ...over }, { id: "t" }),
  );
  sim.updateAvionics(0);
  return sim;
}
function fly(sim: Sim, p: DemoPilot, secs: number) {
  const dt = 1 / 30;
  for (let i = 0; i < secs * 30; i++) {
    p.apply(sim, dt);
    sim.step(dt);
  }
}

describe("demo deck model", () => {
  it("keeps every axis in its range, the heading wraps", () => {
    expect(clampAxis("hdg", 365)).toBe(5);
    expect(clampAxis("hdg", -10)).toBe(350);
    expect(clampAxis("bank", 60)).toBe(45);
    expect(clampAxis("bank", 12)).toBe(10);
    expect(clampAxis("power", 103)).toBe(100);
    expect(clampAxis("alt", 3049)).toBe(3000);
    expect(clampAxis("pitch", -30)).toBe(-15);
  });
  it("the last axis touched owns its side", () => {
    const sim = simAt();
    let t = targetsOf(sim);
    expect(t.lateral).toBe("hdg");
    t = setAxis(t, "bank", 20);
    expect(t.lateral).toBe("bank");
    t = setAxis(t, "hdg", 90);
    expect(t.lateral).toBe("hdg");
    t = setAxis(t, "bank", 0);
    expect(t.lateral).toBe("hdg");
    t = setAxis(t, "pitch", 5);
    expect(t.vertical).toBe("pitch");
    t = setAxis(t, "alt", 4000);
    expect(t.vertical).toBe("alt");
  });
  it("quick action targets", () => {
    expect(climbTarget(3000)).toBe(4000);
    expect(climbTarget(3180)).toBe(4000);
    expect(descendTarget(3000)).toBe(2000);
    // never below 1 000 ft above the ground
    expect(descendTarget(2200, 1500)).toBe(2500);
    expect(turnTarget(350, 1)).toBe(80);
    expect(turnTarget(10, -1)).toBe(280);
  });
  it("offers the slide's failures first, then the classics, known keys only", () => {
    const f = demoFailures(["engine", "nope", "vacuum"]);
    expect(f[0]).toBe("engine");
    expect(f[1]).toBe("vacuum");
    expect(f).not.toContain("nope");
    expect(f.length).toBeLessThanOrEqual(6);
  });
  it("says every word in both languages", () => {
    expect(dw("climb", "fr", { a: "4 000 ft" })).toBe("Monter à 4 000 ft");
    expect(dw("climb", "en", { a: "4,000 ft" })).toBe("Climb to 4,000 ft");
    expect(dw("give", "fr")).toBe("Faire piloter un élève ici");
    expect(dw("takeBack", "fr")).toBe("Reprendre les commandes");
  });
  it("shows the first-time hint once", () => {
    const kv = new Map<string, string>();
    const store = { getItem: (k: string) => kv.get(k) ?? null };
    expect(hintDue(store)).toBe(true);
    kv.set("ifr.demoHint.v1", "1");
    expect(hintDue(store)).toBe(false);
    // no storage (a private window): shown, once per console (DemoPanel keeps it)
    expect(hintDue(null)).toBe(true);
  });
});

describe("demo keyboard", () => {
  it("arrows fly bank and pitch (pull = nose up), Page keys the power, [ ] the heading", () => {
    expect(demoKey("ArrowLeft")).toEqual({ k: "nudge", axis: "bank", d: -5 });
    expect(demoKey("ArrowRight", { shift: true })).toEqual({
      k: "nudge",
      axis: "bank",
      d: 15,
    });
    expect(demoKey("ArrowDown")).toEqual({ k: "nudge", axis: "pitch", d: 1 });
    expect(demoKey("ArrowUp")).toEqual({ k: "nudge", axis: "pitch", d: -1 });
    expect(demoKey("PageUp")).toEqual({ k: "nudge", axis: "power", d: 5 });
    expect(demoKey("PageDown")).toEqual({ k: "nudge", axis: "power", d: -5 });
    expect(demoKey("[")).toEqual({ k: "nudge", axis: "hdg", d: -5 });
    expect(demoKey("^", { code: "BracketRight" })).toEqual({
      k: "nudge",
      axis: "hdg",
      d: 5,
    });
    expect(demoKey("h")).toEqual({ k: "holdHdg" });
  });
  it("leaves the console's own keys alone", () => {
    for (const k of [" ", "n", "N", "p", "Escape", "Enter", "1"])
      expect(demoKey(k)).toBeNull();
  });
});

describe("the demo flies the simulator's flight model", () => {
  it("turns to the heading asked at about the standard rate and holds the altitude", () => {
    const sim = simAt({ hdg: 270, altFt: 3000 });
    const p = new DemoPilot(sim);
    p.engage(sim);
    p.set("hdg", 0, sim);
    fly(sim, p, 20);
    // 3 °/s nominal (FAA IFH ch. 7), the roll-in takes a few seconds: 40–70° turned in 20 s
    const turned = (sim.ac.data.hdgTrue - 270 + 360) % 360;
    expect(turned).toBeGreaterThan(35);
    expect(turned).toBeLessThan(75);
    expect(Math.abs(sim.ac.s.altFt - 3000)).toBeLessThan(120);
    fly(sim, p, 40);
    const err = Math.abs(
      ((((sim.ac.data.hdgTrue - 0) % 360) + 540) % 360) - 180,
    );
    expect(err).toBeLessThan(6);
  });
  it("climbs to the altitude asked with full power, then gives the power back", () => {
    const sim = simAt({ altFt: 3000 });
    const p = new DemoPilot(sim);
    p.engage(sim);
    const cruise = p.t.power;
    p.climb(sim);
    expect(p.t.alt).toBe(4000);
    expect(p.t.power).toBe(100);
    fly(sim, p, 25);
    expect(sim.ac.data.vsFpm).toBeGreaterThan(250);
    fly(sim, p, 150);
    expect(Math.abs(sim.ac.s.altFt - 4000)).toBeLessThan(120);
    expect(p.t.power).toBe(cruise);
  });
  it("holds a bank asked, and the power moves the throttle", () => {
    const sim = simAt();
    const p = new DemoPilot(sim);
    p.engage(sim);
    p.set("bank", -20, sim);
    p.set("power", 40, sim);
    fly(sim, p, 10);
    expect(sim.ac.data.rollDeg).toBeLessThan(-15);
    expect(sim.controls.throttle).toBeCloseTo(0.4, 5);
  });
});

describe("the demo on a final approach (descending on approach power)", () => {
  const final = () => simAt({ hdg: 270, altFt: 1420, iasKt: 65, vsFpm: -450, power: 24 });
  it("taking the controls keeps the descent and never slows to the stall", () => {
    const sim = final();
    const p = new DemoPilot(sim);
    p.engage(sim);
    expect(p.t.vertical).toBe("pitch");
    let minIas = 999;
    for (let i = 0; i < 10; i++) {
      fly(sim, p, 1);
      minIas = Math.min(minIas, sim.ac.data.iasKt);
    }
    expect(minIas).toBeGreaterThan(55);
    expect(sim.ac.data.stallWarn).toBe(false);
  });
  it("« Mettre en palier » adds level-flight power, not the approach power, and keeps flying", () => {
    const sim = final();
    const p = new DemoPilot(sim);
    p.engage(sim);
    expect(p.cruise).toBeGreaterThanOrEqual(60);
    p.level(sim);
    let minIas = 999;
    for (let i = 0; i < 40; i++) {
      fly(sim, p, 1);
      minIas = Math.min(minIas, sim.ac.data.iasKt);
    }
    expect(minIas).toBeGreaterThan(55);
    p.turn(1, sim);
    fly(sim, p, 30);
    expect(sim.ac.data.iasKt).toBeGreaterThan(55);
    expect(sim.ac.data.stallWarn).toBe(false);
  });
  it("« Descendre » is not offered when it would climb (1 420 ft, ground 520 ft)", () => {
    expect(canDescend(1420, 520)).toBe(false);
    expect(canDescend(3000, 0)).toBe(true);
    expect(canClimb(3000)).toBe(true);
  });
});

describe("mirror: the projector draws the console's aircraft", () => {
  it("copies the pose, the bugs, the engine and the failures", () => {
    const a = simAt({ hdg: 120, altFt: 4500 });
    a.ap.hdgBug = 200;
    a.setFailure("vacuum", true);
    const p = new DemoPilot(a);
    p.engage(a);
    p.set("bank", 15, a);
    fly(a, p, 5);
    const b = simAt({ hdg: 270, altFt: 2000 });
    const m = mirrorOf("t||", a);
    // the wire carries plain data
    const wire = JSON.parse(JSON.stringify(m));
    applyMirror(b, wire);
    expect(b.ac.data.hdgTrue).toBeCloseTo(a.ac.data.hdgTrue, 3);
    expect(b.ac.s.altFt).toBeCloseTo(a.ac.s.altFt, 3);
    expect(b.ac.data.rollDeg).toBeCloseTo(a.ac.data.rollDeg, 3);
    expect(b.ap.hdgBug).toBe(200);
    expect(b.failures.vacuum).toBe(true);
    expect(b.controls.throttle).toBeCloseTo(a.controls.throttle, 5);
  });
  it("names a situation the same way in both windows", () => {
    const scene = { id: "s1" } as never;
    expect(
      entryId({
        scene,
        failures: { vacuum: true, gs: false } as never,
        motionSpec: undefined,
      }),
    ).toBe("s1|vacuum|");
    expect(
      entryId({ scene, motionSpec: { preset: "turn-std" } as never }),
    ).toBe("s1||turn-std");
  });
  it("the wire accepts the new messages and a console reaches the projector", () => {
    for (const t of ["sims", "anim", "away"])
      expect(isPresentWire({ t })).toBe(true);
    const subs = new Set<(e: MessageEvent) => void>();
    const make = (name: string) => {
      expect(name).toBe(PRESENT_CHANNEL);
      const mine = new Set<(e: MessageEvent) => void>();
      return {
        postMessage(data: unknown) {
          for (const f of subs) if (!mine.has(f)) f({ data } as MessageEvent);
        },
        addEventListener(_t: string, f: (e: MessageEvent) => void) {
          mine.add(f);
          subs.add(f);
        },
        removeEventListener(_t: string, f: (e: MessageEvent) => void) {
          mine.delete(f);
          subs.delete(f);
        },
        close() {},
      } as unknown as BroadcastChannel;
    };
    const con = presentLink("c", make);
    const proj = presentLink("c", make);
    const got: PresentWire[] = [];
    proj.on((m) => got.push(m));
    const sim = simAt();
    con.post({
      t: "sims",
      stepId: "s",
      who: "instructor",
      list: [mirrorOf("t||", sim)],
    });
    con.post({ t: "anim", stepId: "s", id: "t||", op: "pause" });
    con.post({ t: "away", on: true });
    expect(got.map((m) => m.t)).toEqual(["sims", "anim", "away"]);
    const s = got[0] as Extract<PresentWire, { t: "sims" }>;
    expect(s.who).toBe("instructor");
    expect(s.list[0].pose.altFt).toBeCloseTo(sim.ac.s.altFt, 3);
  });
});

describe("the slide's situation for the simulator", () => {
  const course = { scenes: { a: { id: "a" } } } as unknown as Course;
  it("takes the first instrument naming a course situation", () => {
    const step = {
      id: "s",
      slide: {
        scene: "zzz",
        blocks: [
          { id: "t", kind: "text" },
          { id: "i1", kind: "instrument" },
          {
            id: "i2",
            kind: "instrument",
            scene: "a",
            failures: { engine: true },
          },
        ],
      },
      presenter: [{ k: "failure", key: "vacuum" }],
    } as unknown as Step;
    expect(slideSceneId(step, course)).toEqual({ scene: "a", block: "i2" });
    expect(slideFailures(step, [])).toEqual(["vacuum", "engine"]);
  });
  it("says none when the slide names no course situation", () => {
    const step = {
      id: "s",
      slide: { blocks: [{ id: "i", kind: "instrument" }] },
    } as unknown as Step;
    expect(slideSceneId(step, course)).toBeNull();
  });
});
