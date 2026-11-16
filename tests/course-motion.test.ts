// Instrument animations on slides (src/course/canvas/motion.ts): interpolation, coupling of the flight state,
// presets within the C172S limits, reduced motion, serialisation, hand-over to the student's controls, and no
// change for slides without an animation.
import { describe, expect, it } from "vitest";
import { Sim } from "../src/sim/sim";
import { applyScene } from "../src/course/scene";
import { READY_SITUATIONS, sceneOfSituation } from "../src/course/situations";
import {
  Curve,
  MOTION_PRESETS,
  MotionRun,
  applyFrame,
  bakeMotion,
  frameAt,
  motionIssues,
  motionKey,
  motionPreset,
  motionScript,
  type MotionPreset,
} from "../src/course/canvas/motion";
import { stageView, verticalDots } from "../src/course/goals";
import { exampleCourse } from "../src/course/canvas/examples";
import { validateCourse } from "../src/course/validate";
import { SceneSims } from "../src/course/canvas/instruments";
import type { Course, SlideBlock } from "../src/course/types";

/** a Sim on the preset's own ready situation */
function simFor(p: MotionPreset): Sim {
  const sit = READY_SITUATIONS.find((r) => r.id === (p.situation ?? "level"))!;
  const sim = new Sim();
  applyScene(sim, sceneOfSituation(sit.sit));
  sim.updateAvionics(0);
  return sim;
}
/** sample the flight state every `dt` seconds of the animation */
function sample(p: MotionPreset, dt = 0.5) {
  const sim = simFor(p);
  const tl = bakeMotion(p, sim);
  const out: {
    t: number;
    ias: number;
    alt: number;
    vs: number;
    hdg: number;
    pitch: number;
    bank: number;
    turn: number;
    rpm: number;
    g: number;
    gs: number | undefined;
  }[] = [];
  for (let t = 0; t <= tl.duration + 1e-9; t += dt) {
    applyFrame(sim, tl, frameAt(tl, t));
    const d = sim.ac.data;
    out.push({
      t,
      ias: d.iasKt,
      alt: d.altFt,
      vs: d.vsFpm,
      hdg: d.hdgTrue,
      pitch: d.pitchDeg,
      bank: d.rollDeg,
      turn: d.turnRateDps,
      rpm: d.rpm,
      g: d.gLoad,
      gs: verticalDots(stageView(sim)) ?? undefined,
    });
  }
  return { tl, rows: out };
}
const P = (id: string) => {
  const p = motionPreset(id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};
const at = <T extends { t: number }>(rows: T[], t: number) =>
  rows.reduce((a, r) => (Math.abs(r.t - t) < Math.abs(a.t - t) ? r : a));

describe("interpolation", () => {
  it("passes through every key and never overshoots between two keys", () => {
    const keys: [number, number][] = [
      [0, 0],
      [3, 15],
      [10, 15],
      [12, 40],
      [20, 0],
    ];
    const c = new Curve(keys);
    for (const [t, v] of keys) expect(c.at(t)).toBeCloseTo(v, 6);
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i]!;
      const [t1, v1] = keys[i + 1]!;
      for (let k = 1; k < 20; k++) {
        const v = c.at(t0 + ((t1 - t0) * k) / 20);
        expect(v).toBeGreaterThanOrEqual(Math.min(v0, v1) - 1e-9);
        expect(v).toBeLessThanOrEqual(Math.max(v0, v1) + 1e-9);
      }
    }
    // a flat stretch stays flat (a held bank is held)
    expect(c.at(6)).toBeCloseTo(15, 9);
    // clamped outside the keys
    expect(c.at(-5)).toBe(0);
    expect(c.at(99)).toBe(0);
  });
});

describe("presets", () => {
  it("are at least 14, named in French and English, with distinct ids", () => {
    expect(MOTION_PRESETS.length).toBeGreaterThanOrEqual(14);
    expect(new Set(MOTION_PRESETS.map((p) => p.id)).size).toBe(
      MOTION_PRESETS.length,
    );
    for (const p of MOTION_PRESETS) {
      expect(p.name.en && p.name.fr, p.id).toBeTruthy();
      expect(p.what.en && p.what.fr, p.id).toBeTruthy();
      expect(p.telling ?? 0, p.id).toBeLessThanOrEqual(p.duration);
      expect(motionIssues({ preset: p.id }), p.id).toEqual([]);
      for (const m of p.marks ?? [])
        expect(m.label.en && m.label.fr, `${p.id}/${m.id}`).toBeTruthy();
    }
    for (const id of [
      "asi-arcs",
      "climb-vy",
      "level-off",
      "turn-std",
      "turn-45",
      "stall",
      "descent-500",
      "power",
      "compass",
      "ils-glide",
      "loc-capture",
      "vor-cross",
      "timed-turn",
      "vacuum",
      "adf",
    ])
      expect(motionPreset(id), id).toBeTruthy();
  });

  it("stay within the C172S limits (POH section 2)", () => {
    for (const p of MOTION_PRESETS) {
      const { rows } = sample(p, 1);
      for (const r of rows) {
        // VNE 163 KIAS; under the stall speed only in the stall animation (VS1 48 KIAS clean)
        expect(r.ias, `${p.id} t${r.t}`).toBeLessThanOrEqual(163);
        if (!p.stall)
          expect(r.ias, `${p.id} t${r.t}`).toBeGreaterThanOrEqual(48);
        // normal category: +3.8 g; a training animation stays well inside (45° bank = 1.41 g)
        expect(r.g, `${p.id} t${r.t}`).toBeLessThanOrEqual(2.0);
        expect(Math.abs(r.bank), `${p.id} t${r.t}`).toBeLessThanOrEqual(60);
        // red line 2 700 RPM
        expect(r.rpm, `${p.id} t${r.t}`).toBeLessThanOrEqual(2700);
        expect(Math.abs(r.pitch), `${p.id} t${r.t}`).toBeLessThanOrEqual(20);
      }
    }
  });
});

describe("coupling: one aircraft", () => {
  it("standard-rate turn: bank, turn rate and heading together", () => {
    const { rows } = sample(P("turn-std"));
    const mid = at(rows, 15);
    // standard rate = 3°/s; at 100 KTAS the bank is about 15° (FAA-H-8083-15B ch. 5: TAS/10 + 5)
    expect(mid.turn).toBeCloseTo(3, 1);
    expect(mid.bank).toBeGreaterThan(13);
    expect(mid.bank).toBeLessThan(18);
    // the heading turns at the rate the turn coordinator shows: 3°/s over 4 s ≈ 12°
    const a = at(rows, 12);
    const b = at(rows, 16);
    const dh = ((b.hdg - a.hdg + 540) % 360) - 180;
    expect(dh).toBeGreaterThan(10.5);
    expect(dh).toBeLessThan(13.5);
    // level turn: the altitude holds, the load factor follows the bank (1/cos 15.6° = 1.04)
    expect(Math.abs(mid.alt - rows[0]!.alt)).toBeLessThan(20);
    expect(mid.g).toBeCloseTo(1 / Math.cos((mid.bank * Math.PI) / 180), 2);
  });

  it("45° turn: the load factor is 1.41 g (FAA-H-8083-3C ch. 3)", () => {
    const { rows } = sample(P("turn-45"));
    const mid = at(rows, 20);
    expect(mid.bank).toBeCloseTo(45, 0);
    expect(mid.g).toBeCloseTo(1.41, 1);
  });

  it("3° glide path: the VSI near 5 × ground speed, pitch under level, on the path", () => {
    const { rows } = sample(P("ils-glide"));
    const end = rows[rows.length - 1]!;
    // 3° ≈ 318 ft/NM: at 90 kt about −480 ft/min (FAA-H-8083-15B, rate of descent table)
    expect(end.vs).toBeLessThan(-380);
    expect(end.vs).toBeGreaterThan(-580);
    expect(Math.abs(end.gs ?? 9)).toBeLessThan(0.15);
    expect(end.pitch).toBeLessThan(rows[0]!.pitch + 1);
    // the altimeter unwinds with the VSI
    expect(end.alt).toBeLessThan(rows[0]!.alt - 300);
  });

  it("power change: RPM first, then the speed", () => {
    const { rows } = sample(P("power"), 0.25);
    const r0 = rows[0]!;
    const rpmUp = rows.find((r) => r.rpm > r0.rpm + 300)!;
    const iasUp = rows.find((r) => r.ias > r0.ias + 10)!;
    expect(rpmUp).toBeTruthy();
    expect(iasUp).toBeTruthy();
    expect(rpmUp.t).toBeLessThan(iasUp.t);
    // level flight: the nose comes down as the speed builds
    expect(rows[rows.length - 1]!.pitch).toBeLessThan(r0.pitch);
  });

  it("descent at 500 ft/min: the VSI and the altimeter agree", () => {
    const { rows } = sample(P("descent-500"));
    const a = at(rows, 20);
    const b = at(rows, 26);
    expect(a.vs).toBeCloseTo(-500, -1);
    const rate = ((b.alt - a.alt) / (b.t - a.t)) * 60;
    expect(rate).toBeGreaterThan(-560);
    expect(rate).toBeLessThan(-440);
  });
});

describe("playing", () => {
  const tl = () => {
    const p = P("turn-std");
    return bakeMotion(p, simFor(p));
  };
  it("plays once by default and rests on the last frame", () => {
    const r = new MotionRun(tl(), {});
    expect(r.state).toBe("armed");
    r.start();
    for (let i = 0; i < 2000 && r.state === "playing"; i++) r.tick(1 / 30);
    expect(r.state).toBe("ended");
    expect(r.t).toBeCloseTo(r.tl.duration, 6);
    expect(r.tick(1)).toBe(false);
    r.replay();
    expect(r.state).toBe("playing");
    expect(r.t).toBe(0);
  });
  it("loops when asked, at the speed asked", () => {
    const r = new MotionRun(tl(), { loop: true, speed: 2 });
    r.start();
    r.tick(r.tl.duration * 0.75);
    expect(r.state).toBe("playing");
    expect(r.t).toBeCloseTo(r.tl.duration * 0.5, 6);
  });
  it("reduced motion: the telling frame, played only on « Rejouer »", () => {
    const r = new MotionRun(tl(), { reduced: true });
    expect(r.state).toBe("ended");
    expect(r.t).toBe(r.tl.telling);
    r.start();
    expect(r.state).toBe("ended");
    expect(r.tick(1)).toBe(false);
    r.replay();
    expect(r.state).toBe("playing");
  });
  it("never moves once the student has the controls", () => {
    const r = new MotionRun(tl(), {});
    r.start();
    r.tick(5);
    r.handOver();
    const t = r.t;
    expect(r.tick(1)).toBe(false);
    r.replay();
    r.resume();
    expect(r.state).toBe("handed");
    expect(r.t).toBe(t);
    // every callout is shown once the student flies
    expect(r.markShown("rate")).toBe(true);
  });
  it("a callout tied to a moment appears when the animation reaches it", () => {
    const p = P("climb-vy");
    const r = new MotionRun(bakeMotion(p, simFor(p)), {});
    const m = r.tl.marks.find((x) => x.id === "vy")!;
    r.start();
    r.tick(m.t - 1);
    expect(r.markShown("vy")).toBe(false);
    r.tick(1.5);
    expect(r.markShown("vy")).toBe(true);
  });
  it("hands the situation over from the frame it shows (the Sim keeps that flight state)", () => {
    const p = P("turn-std");
    const sim = simFor(p);
    const tl = bakeMotion(p, sim);
    applyFrame(sim, tl, frameAt(tl, 15));
    const bank = sim.ac.data.rollDeg;
    const hdg = sim.ac.data.hdgTrue;
    // the live controls take over: the flight model flies on from there
    sim.step(0.1);
    expect(Math.abs(sim.ac.data.rollDeg - bank)).toBeLessThan(3);
    expect(
      Math.abs(((sim.ac.data.hdgTrue - hdg + 540) % 360) - 180),
    ).toBeLessThan(2);
  });
});

function instrumentBlocks(
  c: Course,
): Extract<SlideBlock, { kind: "instrument" }>[] {
  const out: Extract<SlideBlock, { kind: "instrument" }>[] = [];
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(walk);
    const o = x as Record<string, unknown>;
    if (o.kind === "instrument" && o.view && o.frame)
      out.push(o as unknown as Extract<SlideBlock, { kind: "instrument" }>);
    for (const v of Object.values(o)) walk(v);
  };
  walk(c);
  return out;
}

describe("stored courses", () => {
  it("an animation is plain data: it survives JSON and validates", () => {
    const course = exampleCourse();
    const b = instrumentBlocks(course)[0]!;
    b.motion = { preset: "turn-std", speed: 2, loop: true };
    const back = JSON.parse(JSON.stringify(course)) as Course;
    expect(instrumentBlocks(back)[0]!.motion).toEqual(b.motion);
    const errs = validateCourse(back).filter((i) => i.level === "error");
    expect(errs.map((e) => `${e.path} ${e.message.en}`)).toEqual([]);
  });
  it("a wrong animation is an error, a callout on a missing moment a warning", () => {
    const course = exampleCourse();
    const b = instrumentBlocks(course)[0]!;
    b.motion = { preset: "barrel-roll", speed: 9 };
    const errs = validateCourse(course).filter(
      (i) => i.level === "error" && i.path.endsWith(".motion"),
    );
    expect(errs.length).toBe(2);
    b.motion = { preset: "turn-std" };
    b.annotations = [
      {
        id: "a1",
        pane: 0,
        type: "tag",
        at: [100, 100],
        text: { en: "x", fr: "x" },
        moment: "nope",
      },
    ];
    const warns = validateCourse(course).filter((i) =>
      i.path.endsWith(".moment"),
    );
    expect(warns.length).toBe(1);
    expect(warns[0]!.level).toBe("warn");
  });
  it("an animation of its own keys is checked", () => {
    expect(
      motionIssues({
        script: {
          duration: 10,
          tracks: {
            bank: [
              [0, 0],
              [5, 20],
            ],
          },
        },
      }),
    ).toEqual([]);
    expect(
      motionIssues({ script: { duration: -1, tracks: {} } }).length,
    ).toBeGreaterThan(0);
    expect(
      motionIssues({ script: { duration: 10, tracks: { warp: [[0, 1]] } } })
        .length,
    ).toBeGreaterThan(0);
  });
  it("no change for slides without an animation", () => {
    expect(motionScript(undefined)).toBeNull();
    expect(motionKey(undefined)).toBe("");
    const course = exampleCourse();
    const sims = new SceneSims({ scenes: course.scenes });
    const id = Object.keys(course.scenes)[0]!;
    const plain = sims.get(id);
    expect(plain?.motion).toBeUndefined();
    // the same situation without an animation is the same Sim as before; with one it is its own
    expect(sims.get(id)).toBe(plain);
    const moving = sims.get(id, undefined, { preset: "turn-std" });
    expect(moving).not.toBe(plain);
    expect(moving?.motion).toBeTruthy();
    // the still Sim was not touched by the animated one
    expect(plain!.sim.ac.data.rollDeg).toBeCloseTo(0, 1);
  });
});
