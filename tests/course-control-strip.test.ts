// The control strip of a live instrument on a slide (src/course/canvas/controlStrip.ts): which controls it draws
// and in which words, the automatic switch to live, where it sits inside the element's frame, the hands on the
// flying controls, and the guarantee that an instrument without controls is drawn exactly as before.
import { describe, expect, it } from "vitest";
import { Sim } from "../src/sim/sim";
import { applyScene } from "../src/course/scene";
import { demoScene } from "../src/course/canvas/factory";
import { allSamples } from "../src/course/samples/index";
import { courseAdvisories, validateCourse } from "../src/course/validate";
import { CONTROL_ORDER } from "../src/course/handover";
import {
  BANK_RANGE,
  STRIP,
  STRIP_GROUPS,
  StripPilot,
  autoSide,
  growForStrip,
  pilotHolds,
  stripCramped,
  stripControls,
  stripDesc,
  stripLabel,
  stripName,
  stripPlan,
  stripShown,
  stripValue,
  stripWidget,
  stripZoom,
  tryLine,
  usefulControls,
  withControl,
  withControls,
} from "../src/course/canvas/controlStrip";
import type { SlideBlock, StageControl } from "../src/course/types";

type Inst = Extract<SlideBlock, { kind: "instrument" }>;
const inst = (over: Partial<Inst> = {}): Inst => ({
  id: "i1",
  kind: "instrument",
  view: { kind: "gauge", gauge: "hsi" },
  frame: { x: 1080, y: 264, w: 720, h: 720, z: 0 },
  ...over,
});
const ALL = [...CONTROL_ORDER];

describe("the strip model, control by control", () => {
  it("draws a knob, a slider, a lever or a key for every control but the aircraft on the top view", () => {
    const widgets = Object.fromEntries(ALL.map((c) => [c, stripWidget(c)]));
    expect(widgets).toEqual({
      obs1: "knob",
      obs2: "knob",
      crs: "knob",
      hdgBug: "knob",
      altBug: "knob",
      baro: "knob",
      bank: "slider",
      pitch: "slider",
      power: "lever",
      cdiSource: "key",
      brg1: "key",
      brg2: "key",
      ap: "key",
      dragAircraft: null,
    });
    expect(stripControls(["power", "dragAircraft", "hdgBug", "obs1"])).toEqual(["obs1", "hdgBug", "power"]);
    expect(stripControls(undefined)).toEqual([]);
  });
  it("names and describes every control in French and in English, in plain words", () => {
    for (const c of ALL)
      for (const lang of ["fr", "en"] as const) {
        expect(stripName(c, lang).length).toBeGreaterThan(1);
        expect(stripLabel(c, lang).length).toBeGreaterThan(1);
        expect(stripDesc(c, lang)).toMatch(/\.$/);
      }
    expect(stripLabel("hdgBug", "fr")).toBe("Cap");
    expect(stripLabel("altBug", "fr")).toBe("Altitude sélectionnée");
    expect(stripLabel("baro", "fr")).toBe("Calage");
    expect(stripLabel("ap", "fr")).toBe("Pilote automatique");
  });
  it("groups every control once: Navigation, Pilotage, Altitude, Automatismes", () => {
    expect(STRIP_GROUPS.map((g) => g.title.fr)).toEqual(["Navigation", "Pilotage", "Altitude", "Automatismes"]);
    const all = STRIP_GROUPS.flatMap((g) => g.controls);
    expect([...all].sort()).toEqual([...ALL].sort());
    expect(new Set(all).size).toBe(all.length);
  });
  it("offers the most useful controls of each instrument", () => {
    expect(usefulControls({ kind: "gauge", gauge: "hsi" })).toEqual(["obs1", "hdgBug"]);
    expect(usefulControls({ kind: "gauge", gauge: "cdi" })).toEqual(["obs2"]);
    expect(usefulControls({ kind: "gauge", gauge: "alt" })).toEqual(["baro"]);
    expect(usefulControls({ kind: "six" })).toEqual(["pitch", "bank", "power"]);
    for (const c of usefulControls({ kind: "pfd" })) expect(stripWidget(c)).not.toBeNull();
  });
  it("derives the quiet line from the controls", () => {
    expect(tryLine(["hdgBug"], "fr")).toBe("Essayez : tournez le cap");
    expect(tryLine(["hdgBug"], "en")).toBe("Try it: turn the heading bug");
    expect(tryLine(["power", "bank", "pitch"], "fr")).toBe("Essayez : inclinez l’avion et changez l’assiette");
    expect(tryLine(["obs1", "obs2"], "fr")).toBe("Essayez : tournez l’OBS");
    expect(tryLine(["dragAircraft"], "fr")).toBe("");
    expect(tryLine([], "en")).toBe("");
  });
});

describe("ticking a control", () => {
  it("turns a frozen instrument live, and says so", () => {
    const r = withControl(inst(), "hdgBug", true, ALL);
    expect(r.block.controls).toEqual(["hdgBug"]);
    expect(r.block.mode).toBe("live");
    expect(r.wentLive).toBe(true);
    expect(stripShown(r.block)).toBe("below");
  });
  it("does not touch the mode of a live instrument, nor of one whose controls are hidden until « À vous »", () => {
    const live = withControl(inst({ mode: "live" }), "obs1", true, ALL);
    expect(live.wentLive).toBe(false);
    expect(live.block.mode).toBe("live");
    const hidden = withControl(inst({ strip: "hidden" }), "obs1", true, ALL);
    expect(hidden.wentLive).toBe(false);
    expect(hidden.block.mode).toBeUndefined();
    expect(stripShown(hidden.block)).toBeNull();
  });
  it("keeps the stage order, and unticking the last control removes the list (never the mode)", () => {
    const a = withControls(inst({ mode: "live" }), ["power", "obs1"].filter(Boolean) as StageControl[]);
    expect(withControl(a.block, "hdgBug", true, ALL).block.controls).toEqual(["obs1", "hdgBug", "power"]);
    const none = withControls(inst({ mode: "live", controls: ["obs1"] }), []);
    expect(none.block.controls).toBeUndefined();
    expect(none.block.mode).toBe("live");
    expect(none.wentLive).toBe(false);
    // the aircraft on the top view has no widget on a slide: it does not make the instrument live
    expect(withControls(inst(), ["dragAircraft"]).wentLive).toBe(false);
  });
});

describe("no change without controls", () => {
  it("shows no strip without a control, on a frozen instrument, on a clip, or when hidden", () => {
    expect(stripShown(inst())).toBeNull();
    expect(stripShown(inst({ mode: "live" }))).toBeNull();
    expect(stripShown(inst({ mode: "live", controls: [] }))).toBeNull();
    expect(stripShown(inst({ controls: ["obs1"] }))).toBeNull();
    expect(stripShown(inst({ mode: "clip", controls: ["obs1"] }))).toBeNull();
    expect(stripShown(inst({ mode: "live", controls: ["obs1"], strip: "hidden" }))).toBeNull();
    expect(stripPlan([], "below", 720, 720)).toBeNull();
    expect(stripPlan(["dragAircraft"], "below", 720, 720)).toBeNull();
  });
  it("draws a strip in the sample courses only on live instruments that list controls", () => {
    let instruments = 0;
    let strips = 0;
    for (const c of allSamples())
      for (const s of c.steps)
        for (const b of s.slide?.blocks ?? []) {
          if (b.kind !== "instrument") continue;
          instruments++;
          const shown = stripShown(b);
          if (shown) strips++;
          expect(!!shown, `${c.id}/${s.id}/${b.id}`).toBe(
            b.mode === "live" && stripControls(b.controls).length > 0 && b.strip !== "hidden",
          );
        }
    expect(instruments).toBeGreaterThan(100);
    expect(strips).toBeGreaterThan(10);
    expect(strips).toBeLessThan(instruments / 2);
  });
});

describe("where the strip sits", () => {
  const within = (a: { x: number; y: number; w: number; h: number }, w: number, h: number) =>
    a.x >= -0.5 && a.y >= -0.5 && a.x + a.w <= w + 0.5 && a.y + a.h <= h + 0.5;
  it("stays inside the element's frame with the instrument, without overlap, on either side", () => {
    for (const [w, h] of [
      [720, 720],
      [840, 840],
      [912, 684],
      [800, 600],
      [480, 480],
    ])
      for (const side of ["below", "right"] as const)
        for (const list of [["hdgBug"], ["obs1", "hdgBug"], ["pitch", "bank", "power"], ALL] as StageControl[][])
          for (const z of [1, 1.2, 2])
            for (const aspect of [undefined, 1, 4 / 3]) {
              const p = stripPlan(list, side, w, h, z, aspect)!;
              const tag = `${w}x${h} ${side} ${list.length} z${z} a${aspect}`;
              expect(within(p.strip, w, h), `strip ${tag}`).toBe(true);
              expect(within(p.inst, w, h), `inst ${tag}`).toBe(true);
              if (side === "below") expect(p.inst.y + p.inst.h, tag).toBeLessThanOrEqual(p.strip.y + 0.5);
              else expect(p.inst.x + p.inst.w, tag).toBeLessThanOrEqual(p.strip.x + 0.5);
              expect(p.lines.flat()).toEqual(stripControls(list));
            }
  });
  it("puts two knobs on one row under a 720 px HSI and wraps what does not fit", () => {
    const two = stripPlan(["obs1", "hdgBug"], "below", 720, 720)!;
    expect(two.lines).toEqual([["obs1", "hdgBug"]]);
    expect(two.strip.h).toBe(2 * STRIP.pad + STRIP.hint + STRIP.gap + STRIP.head + STRIP.gap + STRIP.target);
    expect(two.inst.h).toBe(720 - two.strip.h - STRIP.join);
    const four = stripPlan(["obs1", "obs2", "crs", "hdgBug"], "below", 720, 720)!;
    expect(four.lines.length).toBe(2);
    // the three flying controls of a six-pack stay on one row (their tracks give some width)
    expect(stripPlan(["pitch", "bank", "power"], "below", 800, 600)!.lines.length).toBe(1);
  });
  it("fits the instrument's own shape tight against the strip", () => {
    const p = stripPlan(["bank"], "below", 840, 840, 1, 1)!;
    expect(p.inst.w).toBeCloseTo(p.inst.h, 5);
    expect(p.inst.x).toBeCloseTo((840 - p.inst.w) / 2, 5);
    expect(p.strip.y).toBeCloseTo(p.inst.y + p.inst.h + STRIP.join, 0);
    expect(p.strip.w).toBeGreaterThanOrEqual(Math.floor(p.inst.w));
  });
  it("keeps 44 CSS px targets under a finger at any scale, and the slide as designed under a mouse", () => {
    for (const k of [0.3, 0.45, 0.55, 0.59, 0.61, 0.68, 0.8, 1])
      expect(STRIP.target * stripZoom(k, true) * k, `k=${k}`).toBeGreaterThanOrEqual(44 - 1e-6);
    expect(stripZoom(0.68, true)).toBe(1);
    expect(stripZoom(0.5, false)).toBe(1);
    expect(stripZoom(0.35, false)).toBeGreaterThan(1);
    expect(stripZoom(0)).toBe(1);
    // on a phone the zoom asked for is lowered so the instrument keeps half of the frame
    const phone = stripPlan(["pitch", "bank", "power"], "below", 912, 684, stripZoom(0.2, true))!;
    expect(phone.strip.h).toBeLessThanOrEqual(684 * 0.5 + 1);
    expect(phone.z).toBeGreaterThanOrEqual(1);
  });
  it("chooses the right side by itself for a wide, low instrument, and tells when an instrument is left small", () => {
    expect(autoSide(["bank"], 720, 720)).toBe("below");
    expect(autoSide(["bank"], 912, 310)).toBe("right");
    expect(stripShown(inst({ mode: "live", controls: ["bank"], frame: { x: 0, y: 0, w: 912, h: 310, z: 0 } }))).toBe("right");
    expect(stripCramped(inst({ mode: "live", controls: ["bank"] }))).toBe(false);
    expect(stripCramped(inst({ mode: "live", controls: ["bank"], frame: { x: 0, y: 0, w: 400, h: 400, z: 0 } }))).toBe(true);
    expect(stripCramped(inst({ controls: ["bank"], frame: { x: 0, y: 0, w: 400, h: 400, z: 0 } }))).toBe(false);
    for (const c of allSamples())
      for (const s of c.steps)
        for (const b of s.slide?.blocks ?? [])
          if (b.kind === "instrument") expect(stripCramped(b), `${c.id}/${s.id}/${b.id}`).toBe(false);
  });
  it("grows the element into the free space so the instrument keeps its size, and stops at the next element", () => {
    const b = inst({ mode: "live", controls: ["hdgBug"], frame: { x: 1080, y: 120, w: 720, h: 600, z: 0 } });
    const want = stripPlan(b.controls, "below", 720, 600)!.strip.h + STRIP.join;
    expect(growForStrip({ blocks: [b] }, b.id)).toEqual({ ...b.frame, h: 600 + want });
    const text: SlideBlock = {
      id: "t",
      kind: "text",
      style: "body",
      text: { en: "x" },
      frame: { x: 1080, y: 780, w: 720, h: 100, z: 0 },
    };
    expect(growForStrip({ blocks: [b, text] }, b.id)).toEqual({ ...b.frame, h: 660 });
    // nothing to gain: no room, no strip, or not an instrument
    expect(growForStrip({ blocks: [b, { ...text, frame: { ...text.frame, y: 730 } }] }, b.id)).toBeNull();
    expect(growForStrip({ blocks: [inst({ frame: b.frame })] }, "i1")).toBeNull();
    expect(growForStrip({ blocks: [text] }, "t")).toBeNull();
    // the bottom margin of the slide
    const low = inst({ mode: "live", controls: ["hdgBug"], frame: { x: 1080, y: 264, w: 720, h: 720, z: 0 } });
    expect(growForStrip({ blocks: [low] }, low.id)).toEqual({ ...low.frame, h: 1080 - 48 - 264 });
    const right = inst({ mode: "live", controls: ["hdgBug"], strip: "right", frame: { x: 120, y: 200, w: 700, h: 600, z: 0 } });
    expect(growForStrip({ blocks: [right] }, right.id)!.w).toBeGreaterThan(700);
  });
  it("keeps the markers of the maths slides on their gauge", () => {
    const maths = allSamples().find((c) => c.id === "sample-maths-ifr")!;
    for (const id of ["mi-60-cdi", "mi-turn"]) {
      const blocks = maths.steps.find((s) => s.id === id)!.slide!.blocks;
      const g = blocks.find((b) => b.kind === "instrument") as Inst;
      const p = stripPlan(g.controls, stripShown(g)!, g.frame.w, g.frame.h, 1, 1)!;
      const f = g.frame;
      // the markers drawn on the gauge (the others number the rows of the text)
      const markers = blocks.filter(
        (b) =>
          b.kind === "marker" &&
          b.frame.x < f.x + f.w &&
          b.frame.x + b.frame.w > f.x &&
          b.frame.y < f.y + f.h &&
          b.frame.y + b.frame.h > f.y,
      );
      expect(markers.length).toBeGreaterThan(0);
      for (const m of markers) {
        const cx = m.frame.x + m.frame.w / 2 - g.frame.x;
        const cy = m.frame.y + m.frame.h / 2 - g.frame.y;
        expect(cx, `${id}/${m.id}`).toBeGreaterThan(p.inst.x);
        expect(cx, `${id}/${m.id}`).toBeLessThan(p.inst.x + p.inst.w);
        expect(cy, `${id}/${m.id}`).toBeGreaterThan(p.inst.y);
        expect(cy, `${id}/${m.id}`).toBeLessThan(p.inst.y + p.inst.h);
      }
    }
  });
});

describe("the hands on the flying controls", () => {
  it("holds for the student what the strip does not give", () => {
    expect(pilotHolds(["hdgBug", "obs1"])).toEqual({ lateral: false, holdAlt: false, holdIas: false, pitch: false });
    expect(pilotHolds(["bank"])).toEqual({ lateral: true, holdAlt: true, holdIas: true, pitch: false });
    expect(pilotHolds(["power"])).toEqual({ lateral: true, holdAlt: true, holdIas: false, pitch: false });
    expect(pilotHolds(["pitch"])).toEqual({ lateral: true, holdAlt: false, holdIas: false, pitch: true });
    expect(pilotHolds(["pitch", "bank", "power"])).toEqual({ lateral: true, holdAlt: false, holdIas: false, pitch: true });
  });
  const flying = () => {
    const sim = new Sim();
    applyScene(sim, demoScene("steam"));
    sim.updateAvionics(0);
    return sim;
  };
  it("is hands off until a flying control is used: the situation flies as it did without a strip", () => {
    const a = flying();
    const b = flying();
    const pilot = new StripPilot();
    pilot.configure(b, ["power", "bank", "hdgBug"]);
    expect(pilot.engaged).toBe(false);
    for (let i = 0; i < 90; i++) {
      a.paused = b.paused = false;
      pilot.apply(b, 1 / 30);
      a.step(1 / 30);
      b.step(1 / 30);
    }
    expect(b.ac.s.altFt).toBe(a.ac.s.altFt);
    expect(b.ac.data.iasKt).toBe(a.ac.data.iasKt);
    expect(b.controls.throttle).toBe(a.controls.throttle);
    expect(pilot.dirty).toBe(false);
  });
  it("moves the throttle with the lever, and the airspeed responds while the altitude is held", () => {
    const run = (pct: number | null) => {
      const sim = flying();
      const pilot = new StripPilot();
      pilot.configure(sim, ["power"]);
      if (pct !== null) pilot.setPower(pct, sim);
      for (let i = 0; i < 30 * 40; i++) {
        sim.paused = false;
        pilot.apply(sim, 1 / 30);
        sim.step(1 / 30);
      }
      return { sim, pilot };
    };
    const start = flying();
    const more = run(100);
    const less = run(30);
    expect(more.pilot.engaged).toBe(true);
    expect(more.sim.controls.throttle).toBe(1);
    expect(stripValue("power", more.sim, more.pilot, "fr")).toBe("100 %");
    expect(more.sim.ac.data.iasKt).toBeGreaterThan(less.sim.ac.data.iasKt + 10);
    expect(Math.abs(more.sim.ac.s.altFt - start.ac.s.altFt)).toBeLessThan(250);
    expect(Math.abs(less.sim.ac.s.altFt - start.ac.s.altFt)).toBeLessThan(250);
  });
  it("banks to the angle asked, shows it with its side, and lets go on « Réinitialiser »", () => {
    const sim = flying();
    const pilot = new StripPilot();
    pilot.configure(sim, ["bank"]);
    expect(stripValue("bank", sim, pilot, "fr")).toBe("0°");
    pilot.setBank(22, sim);
    expect(pilot.bank).toBe(20);
    expect(stripValue("bank", sim, pilot, "fr")).toBe("20° D");
    expect(stripValue("bank", sim, pilot, "en")).toBe("20° R");
    pilot.setBank(-999, sim);
    expect(pilot.bank).toBe(BANK_RANGE.min);
    expect(stripValue("bank", sim, pilot, "fr")).toBe("45° G");
    pilot.setBank(20, sim);
    const hdg0 = sim.ac.data.hdgTrue;
    for (let i = 0; i < 30 * 15; i++) {
      sim.paused = false;
      pilot.apply(sim, 1 / 30);
      sim.step(1 / 30);
    }
    expect(sim.ac.data.rollDeg).toBeGreaterThan(14);
    expect(sim.ac.data.rollDeg).toBeLessThan(26);
    expect(((sim.ac.data.hdgTrue - hdg0 + 540) % 360) - 180).toBeGreaterThan(20);
    pilot.capture(sim);
    expect(pilot.engaged).toBe(false);
    expect(pilot.dirty).toBe(false);
  });
  it("shows the knobs' values with their units", () => {
    const sim = flying();
    sim.ap.hdgBug = 120;
    sim.av.obs1 = 5;
    sim.ap.altSel = 5000;
    expect(stripValue("hdgBug", sim, null, "fr")).toBe("120°");
    expect(stripValue("obs1", sim, null, "fr")).toBe("005°");
    expect(stripValue("altBug", sim, null, "fr")).toBe("5 000 ft");
    expect(stripValue("altBug", sim, null, "en")).toBe("5,000 ft");
    expect(stripValue("baro", sim, null, "en")).toMatch(/^\d\d\.\d\d inHg$/);
    expect(stripValue("ap", sim, null, "fr")).toBe("Arrêté");
  });
});

describe("the validator", () => {
  const course = () => structuredClone(allSamples().find((c) => c.id === "sample-holding")!);
  const liveInst = (c: ReturnType<typeof course>) => {
    for (const s of c.steps)
      for (const b of s.slide?.blocks ?? []) if (b.kind === "instrument" && stripShown(b)) return b;
    throw new Error("no live instrument with controls");
  };
  it("accepts the three places of the controls and refuses another", () => {
    for (const v of ["below", "right", "hidden"] as const) {
      const c = course();
      liveInst(c).strip = v;
      expect(validateCourse(c).filter((i) => i.path.endsWith(".strip"))).toEqual([]);
    }
    const c = course();
    (liveInst(c) as { strip?: string }).strip = "above";
    const bad = validateCourse(c).filter((i) => i.path.endsWith(".strip"));
    expect(bad.length).toBe(1);
    expect(bad[0].level).toBe("error");
  });
  it("advises when the controls leave an instrument too small", () => {
    const c = course();
    expect(courseAdvisories(c).filter((i) => i.path.endsWith(".controls"))).toEqual([]);
    const b = liveInst(c);
    b.strip = "below";
    b.frame = { ...b.frame, w: 420, h: 420 };
    const adv = courseAdvisories(c).filter((i) => i.path.endsWith(".controls"));
    expect(adv.length).toBe(1);
    expect(adv[0].blockId).toBe(b.id);
    expect(adv[0].message.fr).toContain("Commandes de l’élève");
  });
});
