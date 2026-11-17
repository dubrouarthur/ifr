// The engines of the course (course/engines): the cycle maths of the flat-four, the parameter models behind the
// gauges, the engine block's schema, and that a 3D engine frees what it built.
import { describe, expect, it } from "vitest";
import {
  CS_PROP,
  FLAT_FOUR,
  TURBOFAN,
  TURBOPROP,
  bypassShare,
  csPropSteady,
  csPropStep,
  cylinderPhase,
  displacementCuIn,
  firingSequence,
  flame,
  flyweightTilt,
  manifoldPressure,
  pistonOutputs,
  pistonTravel,
  rpmSetOf,
  settingsOf,
  strokeAt,
  SPARK_PHI,
  thrustOfN1,
  turbofanOutputs,
  turbopropOutputs,
  valves,
} from "../src/course/engines/model";

describe("the four-stroke cycle of the flat-four", () => {
  it("the O-360 class displaces 361 cu in", () => {
    expect(Math.round(displacementCuIn())).toBe(361);
  });
  it("names the stroke of each half-turn", () => {
    expect(strokeAt(90)).toBe("intake");
    expect(strokeAt(270)).toBe("compression");
    expect(strokeAt(450)).toBe("power");
    expect(strokeAt(630)).toBe("exhaust");
    expect(strokeAt(720 + 10)).toBe("intake");
    expect(strokeAt(-10)).toBe("exhaust");
  });
  it("the piston is at the top at 0° and 360°, at the bottom at 180° and 540°", () => {
    expect(pistonTravel(0)).toBeCloseTo(0, 9);
    expect(pistonTravel(360)).toBeCloseTo(0, 9);
    expect(pistonTravel(180)).toBeCloseTo(1, 9);
    expect(pistonTravel(540)).toBeCloseTo(1, 9);
    // the rod's angle makes the piston pass mid-stroke before 90° of crank
    expect(pistonTravel(90)).toBeGreaterThan(0.5);
    // monotonic down the stroke, symmetric up
    for (let a = 0; a < 180; a += 5)
      expect(pistonTravel(a + 5)).toBeGreaterThan(pistonTravel(a));
    expect(pistonTravel(120)).toBeCloseTo(pistonTravel(240), 9);
  });
  it("fires 1-3-2-4, one power stroke every half turn", () => {
    expect(firingSequence()).toEqual([1, 3, 2, 4]);
    expect([...FLAT_FOUR.firingOrder]).toEqual([1, 3, 2, 4]);
    // at any crank angle exactly one cylinder is on each stroke
    for (let th = 0; th < 720; th += 30) {
      const strokes = [1, 2, 3, 4].map((c) =>
        strokeAt(cylinderPhase(th + 1, c)),
      );
      expect(new Set(strokes).size, `θ=${th}`).toBe(4);
    }
    // cylinder 3 starts its power stroke half a turn after cylinder 1
    expect(strokeAt(cylinderPhase(360 + 1, 1))).toBe("power");
    expect(strokeAt(cylinderPhase(540 + 1, 3))).toBe("power");
    expect(strokeAt(cylinderPhase(720 + 1, 2))).toBe("power");
    expect(strokeAt(cylinderPhase(900 + 1, 4))).toBe("power");
  });
  it("opposed cylinders reach top dead centre together (a boxer)", () => {
    for (let th = 0; th < 720; th += 15) {
      expect(pistonTravel(cylinderPhase(th, 1))).toBeCloseTo(
        pistonTravel(cylinderPhase(th, 2)),
        9,
      );
      expect(pistonTravel(cylinderPhase(th, 3))).toBeCloseTo(
        pistonTravel(cylinderPhase(th, 4)),
        9,
      );
    }
  });
  it("valve timing: intake open on the intake stroke, exhaust on the exhaust stroke, both shut for compression and power, overlap at TDC", () => {
    expect(valves(90).intake).toBeGreaterThan(0.5);
    expect(valves(90).exhaust).toBe(0);
    expect(valves(630).exhaust).toBeGreaterThan(0.5);
    expect(valves(630).intake).toBe(0);
    for (const phi of [300, 360, 400]) {
      expect(valves(phi).intake, `${phi}`).toBe(0);
      expect(valves(phi).exhaust, `${phi}`).toBe(0);
    }
    // the intake opens before TDC, the exhaust closes after it
    expect(valves(710).overlap).toBe(true);
    expect(valves(5).overlap).toBe(true);
    expect(valves(30).overlap).toBe(false);
    // the intake closes after BDC (60° ABDC): still open early in compression, shut by 250°
    expect(valves(200).intake).toBeGreaterThan(0);
    expect(valves(250).intake).toBe(0);
    // the exhaust opens before BDC (60° BBDC): open late in the power stroke
    expect(valves(500).exhaust).toBeGreaterThan(0);
  });
  it("the spark comes 25° before TDC and the flame lights the power stroke only", () => {
    expect(SPARK_PHI).toBe(335);
    expect(flame(300)).toBe(0);
    expect(flame(360)).toBeGreaterThan(0.5);
    expect(flame(450)).toBeGreaterThan(0);
    expect(flame(600)).toBe(0);
    expect(flame(90)).toBe(0);
  });
});

describe("the carburetted flat-four on a fixed-pitch propeller", () => {
  const run = (o: Partial<Parameters<typeof pistonOutputs>[0]> = {}) =>
    pistonOutputs({ throttle: 1, mixture: 1, carbHeat: false, ...o });
  it("more throttle: more MAP and more rpm", () => {
    let last = { rpm: 0, mapInHg: 0 };
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const o = run({ throttle: t });
      expect(o.rpm).toBeGreaterThan(last.rpm);
      expect(o.mapInHg).toBeGreaterThan(last.mapInHg);
      last = o;
    }
  });
  it("idles near 600 rpm, never over 2,700 at full throttle and best power in cruise", () => {
    const idle = run({ throttle: 0 });
    expect(idle.rpm).toBeGreaterThan(450);
    expect(idle.rpm).toBeLessThan(800);
    const cruise = run({ mixture: 0.75, iasKt: 100 });
    expect(cruise.rpm).toBeLessThanOrEqual(2700);
    expect(cruise.rpm).toBeGreaterThan(2600);
    // at run-up (no airspeed) the propeller holds it lower
    expect(run().rpm).toBeLessThan(cruise.rpm);
  });
  it("carburettor heat lowers the rpm (about 100 at run-up)", () => {
    const a = run({ throttle: 0.6 });
    const b = run({ throttle: 0.6, carbHeat: true });
    expect(b.rpm).toBeLessThan(a.rpm);
    expect(a.rpm - b.rpm).toBeGreaterThan(50);
    expect(a.rpm - b.rpm).toBeLessThan(250);
  });
  it("the mixture: best power rich of peak EGT, idle cut-off stops the engine", () => {
    expect(run({ mixture: 0.75 }).rpm).toBeGreaterThan(run({ mixture: 1 }).rpm);
    expect(run({ mixture: 0.6 }).egtF).toBeGreaterThan(
      run({ mixture: 1 }).egtF,
    );
    expect(run({ mixture: 0.6 }).egtF).toBeGreaterThan(
      run({ mixture: 0.4 }).egtF,
    );
    const cut = run({ mixture: 0 });
    expect(cut.running).toBe(false);
    expect(cut.rpm).toBe(0);
  });
  it("MAP falls with altitude at full throttle", () => {
    expect(manifoldPressure(1, 0)).toBeGreaterThan(manifoldPressure(1, 6000));
    expect(manifoldPressure(1, 0)).toBeLessThan(29.92);
  });
});

describe("the constant-speed propeller", () => {
  it("keeps the rpm the lever set when MAP changes within the governing range, with a coarser blade", () => {
    const set = 2400;
    let lastBlade = 0;
    for (let map = 15; map <= 28; map += 1) {
      const o = csPropSteady({ mapInHg: map, rpmSet: set, tasKt: 100 });
      expect(o.regime, `${map}`).toBe("governing");
      expect(o.rpm).toBe(set);
      expect(o.bladeDeg).toBeGreaterThan(lastBlade);
      expect(o.bladeDeg).toBeGreaterThanOrEqual(CS_PROP.fineDeg);
      expect(o.bladeDeg).toBeLessThanOrEqual(CS_PROP.coarseDeg);
      lastBlade = o.bladeDeg;
    }
  });
  it("a lower rpm setting: a coarser blade for the same power", () => {
    const a = csPropSteady({ mapInHg: 24, rpmSet: 2600 });
    const b = csPropSteady({ mapInHg: 24, rpmSet: 2200 });
    expect(b.bladeDeg).toBeGreaterThan(a.bladeDeg);
  });
  it("too little power: the blades sit on the fine stop and the rpm falls under the setting", () => {
    const o = csPropSteady({ mapInHg: 11, rpmSet: 2500, tasKt: 90 });
    expect(o.regime).toBe("fineStop");
    expect(o.rpm).toBeLessThan(2500);
  });
  it("in time: a throttle burst overspeeds briefly, the flyweights fly out, the governor brings the rpm back", () => {
    const set = 2400;
    let s = {
      rpm: set,
      bladeDeg: csPropSteady({ mapInHg: 18, rpmSet: set }).bladeDeg,
    };
    let peak = 0;
    for (let k = 0; k < 400; k++) {
      s = csPropStep(s, { mapInHg: 26, rpmSet: set }, 0.02);
      peak = Math.max(peak, s.rpm);
    }
    expect(peak).toBeGreaterThan(set + 20);
    expect(flyweightTilt(peak, set)).toBeGreaterThan(0);
    expect(Math.abs(s.rpm - set)).toBeLessThan(15);
    expect(s.bladeDeg).toBeCloseTo(
      csPropSteady({ mapInHg: 26, rpmSet: set }).bladeDeg,
      0,
    );
    expect(flyweightTilt(set, set)).toBe(0);
    expect(flyweightTilt(set - 200, set)).toBeLessThan(0);
  });
  it("the lever spans 2,100 to 2,700 rpm", () => {
    expect(rpmSetOf(0)).toBe(2100);
    expect(rpmSetOf(1)).toBe(2700);
  });
});

describe("the free-turbine turboprop", () => {
  it("Ng, ITT and torque rise with the power lever; never over the limits", () => {
    let last = turbopropOutputs({ throttle: 0, prop: 1 });
    expect(last.ng).toBe(TURBOPROP.ngIdle);
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const o = turbopropOutputs({ throttle: t, prop: 1 });
      expect(o.ng).toBeGreaterThan(last.ng);
      expect(o.ittC).toBeGreaterThan(last.ittC);
      expect(o.shp).toBeGreaterThan(last.shp);
      expect(o.ittC).toBeLessThanOrEqual(TURBOPROP.ittMax);
      expect(o.ng).toBeLessThanOrEqual(TURBOPROP.ngMax);
      expect(o.torqueFtLb).toBeLessThanOrEqual(TURBOPROP.torqueMax);
      last = o;
    }
  });
  it("Np is the propeller lever's in the governing range, whatever the power", () => {
    for (const t of [0.5, 0.7, 1])
      expect(turbopropOutputs({ throttle: t, prop: 1 }).np).toBe(1900);
    expect(turbopropOutputs({ throttle: 0.7, prop: 0 }).np).toBe(1600);
    // at ground idle the propeller is under its governing range
    const idle = turbopropOutputs({ throttle: 0, prop: 1 });
    expect(idle.governing).toBe(false);
    expect(idle.np).toBeLessThan(1600);
  });
  it("torque is power over Np", () => {
    const o = turbopropOutputs({ throttle: 0.8, prop: 0.5 });
    expect(o.torqueFtLb).toBeCloseTo((o.shp * 5252) / o.np, -1);
  });
});

describe("the two-spool turbofan", () => {
  it("thrust grows with N1, steeply (monotonic)", () => {
    for (let n = 0; n < 104; n += 2)
      expect(thrustOfN1(n + 2)).toBeGreaterThan(thrustOfN1(n));
    expect(thrustOfN1(100)).toBeCloseTo(1, 9);
    expect(thrustOfN1(50)).toBeLessThan(0.25);
  });
  it("lever → N1, N2, EGT, thrust: all rise together, inside the limits", () => {
    let last = turbofanOutputs({ throttle: 0, reverse: false });
    expect(last.n1).toBe(TURBOFAN.n1Idle);
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const o = turbofanOutputs({ throttle: t, reverse: false });
      expect(o.n1).toBeGreaterThan(last.n1);
      expect(o.n2).toBeGreaterThan(last.n2);
      expect(o.egtC).toBeGreaterThan(last.egtC);
      expect(o.thrustPct).toBeGreaterThanOrEqual(last.thrustPct);
      expect(o.n1).toBeLessThan(TURBOFAN.n1Red);
      expect(o.egtC).toBeLessThan(TURBOFAN.egtRed);
      last = o;
    }
  });
  it("by-pass ratio 5.1: about 84 % of the air goes round the core", () => {
    expect(turbofanOutputs({ throttle: 0.5, reverse: false }).bypassRatio).toBe(
      5.1,
    );
    expect(bypassShare(5.1)).toBeCloseTo(5.1 / 6.1, 9);
    expect(bypassShare(5.1)).toBeGreaterThan(0.83);
    expect(bypassShare(0)).toBe(0);
  });
  it("reversers: the net thrust turns negative and N1 is limited", () => {
    const r = turbofanOutputs({ throttle: 1, reverse: true });
    expect(r.thrustPct).toBeLessThan(0);
    expect(r.n1).toBeLessThanOrEqual(TURBOFAN.n1MaxReverse);
  });
});

describe("settings", () => {
  it("fills what a slide leaves out and clamps the rest", () => {
    const s = settingsOf("piston", { throttle: 3, mixture: Number.NaN });
    expect(s.throttle).toBe(1);
    expect(s.mixture).toBe(1);
    expect(s.carbHeat).toBe(false);
  });
});

// ------------------------------------------------------------------ the levers in time, the block, the 3D view
import { vi } from "vitest";
import * as THREE from "three";
import { buildEngineModel, mountEngine } from "../src/course/engines/view";
import { EngineSim, ENGINE_CONTROLS, engineTargets } from "../src/course/engines/sim";
import { disposeTree, makeMats } from "../src/course/engines/kit";
import { PISTON_STAGES } from "../src/course/engines/piston3d";
import { PROP_STAGES } from "../src/course/engines/prop3d";
import { TURBOFAN_STAGES, TURBOPROP_STAGES } from "../src/course/engines/turbine3d";
import { ENGINE_STAGE_COUNT, validateCourse } from "../src/course/validate";
import { galleryCourse } from "../src/course/samples/exampleSlides";
import { LIBRARY_ITEMS } from "../src/course/canvas/factory";
import type { Course, EngineKind, SlideBlock } from "../src/course/types";

describe("the magneto check", () => {
  it("one magneto alone drops the run-up rpm a little (inside the POH's 150 rpm), off stops the engine", () => {
    const at = (mags: "both" | "left" | "right" | "off") =>
      pistonOutputs({ throttle: 0.58, mixture: 1, carbHeat: false, mags });
    const both = at("both").rpm;
    expect(both).toBeGreaterThan(1600);
    expect(both).toBeLessThan(2000);
    for (const m of ["left", "right"] as const) {
      const drop = both - at(m).rpm;
      expect(drop, m).toBeGreaterThan(20);
      expect(drop, m).toBeLessThan(150);
    }
    expect(at("left").rpm).toBe(at("right").rpm);
    expect(at("off").running).toBe(false);
  });
});

describe("the engine in time (EngineSim)", () => {
  it("a turbofan spools up over seconds; a piston answers at once", () => {
    const fan = new EngineSim("turbofan", { throttle: 0 });
    fan.setSettings({ throttle: 1 });
    fan.step(1);
    expect(fan.v.n1).toBeLessThan(80);
    for (let k = 0; k < 200; k++) fan.step(0.1);
    expect(fan.v.n1).toBeCloseTo(engineTargets("turbofan", fan.set).n1, 0);
    const pis = new EngineSim("piston", { throttle: 0 });
    pis.setSettings({ throttle: 1 });
    for (let k = 0; k < 30; k++) pis.step(0.1);
    expect(pis.v.rpm).toBeCloseTo(engineTargets("piston", pis.set).rpm, -1);
  });
  it("the constant-speed propeller comes back on speed after a throttle change, and says so", () => {
    const s = new EngineSim("prop", { throttle: 0.4, prop: 0.5 });
    s.setSettings({ throttle: 0.95 });
    let over = false;
    for (let k = 0; k < 300; k++) {
      s.step(0.02);
      if (s.status("fr").startsWith("Survitesse")) over = true;
    }
    expect(over).toBe(true);
    expect(Math.abs(s.v.rpm - s.v.rpmSet)).toBeLessThan(15);
    expect(s.status("fr")).toMatch(/^En régime/);
    expect(s.status("en")).toMatch(/^On speed/);
  });
});

describe("the engine3d block", () => {
  const block = (o: Partial<Extract<SlideBlock, { kind: "engine3d" }>> = {}): SlideBlock => ({
    id: "e1",
    kind: "engine3d",
    engine: "piston",
    frame: { x: 120, y: 336, w: 1680, h: 648, z: 1 },
    alt: { en: "Piston engine", fr: "Moteur à pistons" },
    controls: ["throttle", "mixture", "carbHeat", "magnetos"],
    set: { throttle: 0.4, mixture: 0.8, carbHeat: true, mags: "left" },
    stage: 2,
    labels: true,
    slow: true,
    caption: { en: "The four strokes", fr: "Les quatre temps" },
    ...o,
  } as SlideBlock);
  const course = (b: SlideBlock): Course => {
    const c = galleryCourse();
    return { ...c, steps: [{ ...c.steps[0], id: "s1", slide: { ...c.steps[0].slide!, blocks: [b] } }] };
  };
  const errors = (b: SlideBlock) =>
    validateCourse(course(b))
      .filter((i) => i.level === "error")
      .map((i) => i.path);
  it("round-trips through JSON (a saved course, a shared link) and validates", () => {
    const b = block();
    expect(JSON.parse(JSON.stringify(b))).toEqual(b);
    expect(errors(JSON.parse(JSON.stringify(b)))).toEqual([]);
  });
  it("refuses an unknown engine, a lever that engine does not have, a lever out of range, an unknown step", () => {
    expect(errors(block({ engine: "rocket" as EngineKind })).some((p) => p.endsWith(".engine"))).toBe(true);
    expect(errors(block({ engine: "turbofan", controls: ["mixture"] })).some((p) => p.includes(".controls[0]"))).toBe(true);
    expect(errors(block({ set: { throttle: 2 } })).some((p) => p.endsWith(".set.throttle"))).toBe(true);
    expect(errors(block({ stage: 9 })).some((p) => p.endsWith(".stage"))).toBe(true);
  });
  it("the validator's step counts and levers are the models' own", () => {
    expect(ENGINE_STAGE_COUNT).toEqual({
      piston: PISTON_STAGES.length,
      prop: PROP_STAGES.length,
      turboprop: TURBOPROP_STAGES.length,
      turbofan: TURBOFAN_STAGES.length,
    });
    for (const k of ["piston", "prop", "turboprop", "turbofan"] as EngineKind[])
      for (const c of ENGINE_CONTROLS[k]) expect(errors(block({ engine: k, controls: [c], set: {}, stage: 0 }))).toEqual([]);
  });
  it("the studio offers the four engines, and the gallery has one ready slide each", () => {
    const items = LIBRARY_ITEMS.filter((i) => i.tab === "engines");
    expect(items.map((i) => (i.make() as { engine: string }).engine).sort()).toEqual(["piston", "prop", "turbofan", "turboprop"]);
    const blocks = galleryCourse().steps.flatMap((s) => s.slide?.blocks ?? []);
    expect(blocks.filter((b) => b.kind === "engine3d").map((b) => (b as { engine: string }).engine).sort()).toEqual([
      "piston",
      "prop",
      "turbofan",
      "turboprop",
    ]);
  });
});

// a tiny DOM: enough for mountEngine (elements, attributes, listeners, sizes)
class El {
  children: El[] = [];
  parent: El | null = null;
  attrs = new Map<string, string>();
  listeners = new Map<string, Set<unknown>>();
  style: Record<string, string> & { setProperty(k: string, v: string): void } = Object.assign(Object.create(null), {
    setProperty() {},
  });
  classes = new Set<string>();
  classList = {
    add: (...c: string[]) => c.forEach((x) => this.classes.add(x)),
    remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)),
    toggle: (c: string, on?: boolean) => ((on ?? !this.classes.has(c)) ? this.classes.add(c) : this.classes.delete(c)),
    contains: (c: string) => this.classes.has(c),
  };
  textContent = "";
  tabIndex = -1;
  type = "";
  id = "";
  htmlFor = "";
  value = "";
  min = "";
  max = "";
  step = "";
  clientWidth = 1000;
  clientHeight = 600;
  offsetWidth = 80;
  offsetHeight = 24;
  offsetLeft = 0;
  offsetTop = 0;
  constructor(public tagName: string) {}
  set className(v: string) {
    this.classes = new Set(v.split(/\s+/).filter(Boolean));
  }
  get className() {
    return [...this.classes].join(" ");
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  append(...ns: El[]) {
    for (const n of ns) {
      n.parent?.children.splice(n.parent.children.indexOf(n), 1);
      n.parent = this;
      this.children.push(n);
    }
  }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  replaceChildren(...ns: El[]) {
    for (const c of [...this.children]) c.remove();
    this.append(...ns);
  }
  addEventListener(t: string, f: unknown) {
    if (!this.listeners.has(t)) this.listeners.set(t, new Set());
    this.listeners.get(t)!.add(f);
  }
  removeEventListener(t: string, f: unknown) {
    this.listeners.get(t)?.delete(f);
  }
  get listenerCount() {
    let n = 0;
    for (const s of this.listeners.values()) n += s.size;
    for (const c of this.children) n += c.listenerCount;
    return n;
  }
  getBoundingClientRect() {
    return { width: this.clientWidth, height: this.clientHeight, left: 0, top: 0 };
  }
  querySelectorAll() {
    return [];
  }
  focus() {}
  setPointerCapture() {}
}

describe("the 3D view frees what it built", () => {
  it("every geometry and material of a model is disposed", () => {
    for (const k of ["piston", "prop", "turboprop", "turbofan"] as EngineKind[]) {
      const mats = makeMats();
      const model = buildEngineModel(k, mats);
      const seen = new Set<THREE.BufferGeometry | THREE.Material>();
      model.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) seen.add(m.geometry);
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        if (mm) for (const x of Array.isArray(mm) ? mm : [mm]) seen.add(x);
      });
      for (const x of Object.values(mats)) seen.add(x);
      const freed = new Set<unknown>();
      for (const x of seen) x.addEventListener("dispose", () => freed.add(x));
      expect(seen.size, k).toBeGreaterThan(10);
      disposeTree(model.root, mats);
      expect(freed.size, k).toBe(seen.size);
      expect(model.root.children.length).toBe(0);
    }
  });
  it("destroy(): the renderer and its context go, the frame loop stops, listeners and the DOM are removed", () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { document: g.document, raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
    const body = new El("body");
    const docListeners = new Set<unknown>();
    g.document = {
      createElement: (t: string) => new El(t),
      body,
      activeElement: null,
      visibilityState: "visible",
      addEventListener: (_: string, f: unknown) => docListeners.add(f),
      removeEventListener: (_: string, f: unknown) => docListeners.delete(f),
    };
    const pending = new Map<number, (t: number) => void>();
    let id = 0;
    g.requestAnimationFrame = (f: (t: number) => void) => (pending.set(++id, f), id);
    g.cancelAnimationFrame = (n: number) => pending.delete(n);
    try {
      const renderer = {
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        setClearColor: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
        forceContextLoss: vi.fn(),
      };
      const geoDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
      const host = new El("div");
      const h = mountEngine(host as unknown as HTMLElement, {
        kind: "piston",
        lang: "fr",
        reducedMotion: false,
        renderer: () => renderer,
      });
      // a few frames: it draws, and keeps going while it plays
      for (let k = 0; k < 3; k++) {
        const [n, f] = [...pending][0] ?? [];
        expect(f, `frame ${k}`).toBeTruthy();
        pending.delete(n!);
        f!(16 * (k + 1));
      }
      expect(renderer.render).toHaveBeenCalled();
      expect(host.children.length).toBe(1);
      expect(host.listenerCount).toBeGreaterThan(0);
      expect(docListeners.size).toBe(1);
      const before = geoDispose.mock.calls.length;
      const root = host.children[0];
      h.destroy();
      expect(h.destroyed).toBe(true);
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
      expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
      expect(pending.size).toBe(0);
      expect(host.children.length).toBe(0);
      expect(docListeners.size).toBe(0);
      // the canvas' own listeners (drag, keys) and the root's are removed
      expect(root.children.find((c) => c.classes.has("eng-view"))!.children[0].listenerCount).toBe(0);
      expect(geoDispose.mock.calls.length - before).toBeGreaterThan(20);
      // twice is harmless
      h.destroy();
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
      geoDispose.mockRestore();
    } finally {
      g.document = saved.document;
      g.requestAnimationFrame = saved.raf;
      g.cancelAnimationFrame = saved.caf;
    }
  });
});
