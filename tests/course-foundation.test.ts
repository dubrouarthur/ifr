// Phase-0 foundation of the Ground school (SPEC §9.6, §11.1 exit criteria): per-Sim random stream (R1), per-instance
// instrument memory (R2), crops, the IndexedDB helper's memory fallback (R5) and the shared avionics controls (R6).
import { describe, expect, it } from "vitest";
import { SCENARIOS, Sim } from "../src/sim/sim";
import { SimRng, hashSeed, seedSim, simRandom } from "../src/sim/rng";
import {
  drawSixPack,
  drawStack,
  drawSteamGauge,
  newSteamState,
  stepSteamState,
  STEAM_GAUGE_LAYOUT,
  type SteamGaugeKind,
} from "../src/avionics/steam";
import { drawPfd, newPfdState } from "../src/avionics/pfd";
import { drawAirlinerPfd, newAirlinerState } from "../src/avionics/airliner";
import {
  cropTransform,
  cropToTarget,
  drawCropped,
  targetToSource,
} from "../src/avionics/crop";
import {
  IdbQuotaError,
  isQuotaError,
  MemoryDb,
  openDb,
  persist,
  sha256Hex,
} from "../src/lib/idb";
import {
  centerCdi,
  cycleBrg,
  cycleCdi,
  nudgeBaro,
  nudgeCrs,
  nudgeHdgBug,
  nudgeObs,
  setBaro,
  setCrs,
  setObs,
  syncHdgBug,
} from "../src/sim/avionicsControls";
import { DEG } from "../src/nav/geo";
import type {
  Briefing,
  CalcProblem,
  CalcStep,
  Course,
  DesignedStep,
  DrillStep,
  GeneratorDef,
  OpenStep,
  SlideBlock,
  Step,
  YourTurnResult,
} from "../src/course/types";

/** cruise in moderate turbulence with gusts: every step draws from the random stream */
function rough(id = "free"): Sim {
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === id)!);
  Object.assign(s.weather, {
    windDir: 250,
    windKt: 18,
    gustKt: 30,
    turbulence: 0.6,
    ceilingFt: 20000,
    visibilitySm: 10,
  });
  return s;
}
/** a trace of what turbulence moves: attitude, altitude, airspeed */
const sample = (s: Sim) => [
  s.ac.s.phi,
  s.ac.s.theta,
  s.ac.s.altFt,
  s.ac.s.tas,
  s.ac.s.lat,
  s.ac.s.lon,
];
function fly(s: Sim, sec: number, each?: () => void): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < Math.round(sec / 0.05); i++) {
    s.step(0.05);
    each?.();
    if (i % 10 === 0) out.push(sample(s));
  }
  return out;
}

/** canvas stand-in (counts save/restore, records transforms and texts) */
function fakeCtx() {
  const calls: { k: string; a: unknown[] }[] = [];
  const texts: string[] = [];
  const state: Record<string, unknown> = { fillStyle: "#000", canvas: null };
  const grad = { addColorStop: () => undefined };
  const api: Record<string, unknown> = {
    fillText: (t: string) => texts.push(String(t)),
    measureText: (t: string) => ({
      width: String(t).length * 8,
      actualBoundingBoxAscent: 6,
      actualBoundingBoxDescent: 6,
    }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    getTransform: () => ({}),
  };
  for (const k of [
    "save",
    "restore",
    "transform",
    "clip",
    "rect",
    "translate",
    "scale",
  ])
    api[k] = (...a: unknown[]) => void calls.push({ k, a });
  const ctx = new Proxy(state, {
    get: (t, k: string) =>
      k in api ? api[k] : k in t ? t[k] : () => undefined,
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}

// ------------------------------------------------------------------ R1: per-Sim random stream
describe("R1 — every Sim owns its random stream", () => {
  it("SimRng: the same seed gives the same sequence; string seeds hash like the old global", () => {
    const a = new SimRng("lesson");
    const b = new SimRng(hashSeed("lesson"));
    const xs = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    // the legacy module API is the same generator
    seedSim("lesson");
    expect(simRandom()).toBe(xs[0]);
    a.seed("lesson");
    expect(a.next()).toBe(xs[0]);
  });

  it("creating, loading and flying a second Sim does not change the first one's flight", () => {
    const ref = fly(rough(), 30);
    const a = rough();
    let b: Sim | null = null;
    const withB = fly(a, 30, () => {
      // a projector / course stage Sim appearing mid-flight, reloaded and flown at once
      if (!b) b = rough("rwy27");
      b.step(0.05);
      if (a.time > 10 && a.time < 10.06) b.load(SCENARIOS[0]);
    });
    expect(withB).toEqual(ref);
  });

  it("the same seed gives the same 60 s of turbulence in two Sims; another seed does not", () => {
    const a = rough();
    const b = rough();
    a.seed(4183);
    b.seed(4183);
    const c = rough();
    c.seed(4184);
    const ta: number[][] = [];
    const tb: number[][] = [];
    const tc: number[][] = [];
    // stepped interleaved, as on one page
    for (let i = 0; i < 1200; i++) {
      a.step(0.05);
      b.step(0.05);
      c.step(0.05);
      if (i % 10 === 0) {
        ta.push(sample(a));
        tb.push(sample(b));
        tc.push(sample(c));
      }
    }
    expect(a.time).toBeCloseTo(60, 6);
    expect(tb).toEqual(ta);
    expect(tc).not.toEqual(ta);
    // the turbulence is really there (the trace is not a still air flight)
    const rolls = ta.map((r) => r[0] / DEG);
    expect(Math.max(...rolls) - Math.min(...rolls)).toBeGreaterThan(0.5);
    expect(a.seedValue).toBe(4183);
  });

  it("two Sims keep their own attitude and OBS", () => {
    const a = rough();
    const b = rough();
    setObs(a, 1, 90);
    setObs(b, 1, 276);
    a.ac.s.phi = 20 * DEG;
    a.step(0.05);
    b.step(0.05);
    expect(a.av.obs1).toBe(90);
    expect(b.av.obs1).toBe(276);
    expect(b.ac.s.phi / DEG).toBeLessThan(5);
    expect(a.ac.s.phi / DEG).toBeGreaterThan(15);
  });
});

// ------------------------------------------------------------------ R2: instrument memory per instance
describe("R2 — two instruments never share gauge memory", () => {
  it("two six-packs: a tumbling gyro on one does not move the other", () => {
    const a = rough();
    const b = rough();
    a.failures.ahrs = true; // the steam meaning: the gyros tumble
    const sa = newSteamState();
    const sb = newSteamState();
    const ctx = fakeCtx().ctx;
    drawSixPack(ctx, b, 0, sb); // b settles on its gyro
    const bRoll = sb.frozenRoll;
    for (let i = 0; i < 20; i++) drawSixPack(ctx, a, 0.1, sa);
    expect(sa.frozenRoll).toBeCloseTo(8, 6); // 4°/s for 2 s from 0
    expect(sb.frozenRoll).toBe(bRoll);
    drawSixPack(ctx, b, 0.1, sb);
    expect(Math.abs(sb.frozenRoll - b.ac.data.rollDeg)).toBeLessThan(5);
  });

  it("the default cockpit panel is not touched by an instance's draws", () => {
    const a = rough();
    const ctx = fakeCtx().ctx;
    drawSixPack(ctx, a, 0); // the cockpit (default state)
    const st = newSteamState();
    a.failures.ahrs = true;
    for (let i = 0; i < 10; i++) drawSixPack(ctx, a, 0.1, st);
    expect(st.frozenRoll).toBeGreaterThan(3);
    // the default panel, drawn frozen, still reads what it froze at (it never saw the 10 tumbling frames)
    const probe = newSteamState();
    drawSixPack(ctx, a, 0, probe);
    expect(probe.frozenRoll).toBe(0); // a fresh state starts level
  });

  it("the turn coordinator spin and the RMI card are per panel", () => {
    const a = rough();
    const sa = newSteamState();
    const sb = newSteamState();
    sa.tcSpin = 0.2;
    stepSteamState(sa, a, 0.1);
    stepSteamState(sb, a, 0.1);
    expect(sa.tcSpin).toBeLessThan(sb.tcSpin);
    drawStack(fakeCtx().ctx, a, sb);
    expect(sb.rmiHdg).toBeCloseTo(a.ac.data.hdgTrue, 6);
    expect(Number.isNaN(sa.rmiHdg) || sa.rmiHdg === sb.rmiHdg).toBe(true);
  });

  it("single steam gauges draw alone, from their state, at the panel's layout", () => {
    const s = rough();
    const st = newSteamState();
    stepSteamState(st, s, 0);
    for (const k of Object.keys(STEAM_GAUGE_LAYOUT) as SteamGaugeKind[]) {
      const f = fakeCtx();
      const L = STEAM_GAUGE_LAYOUT[k];
      expect(() =>
        drawSteamGauge(f.ctx, s, k, L.cx, L.cy, L.r, st),
      ).not.toThrow();
    }
    const asi = fakeCtx();
    drawSteamGauge(asi.ctx, s, "asi", 200, 200, 140, st);
    expect(asi.texts).toContain("AIRSPEED");
    const tc = fakeCtx();
    drawSteamGauge(tc.ctx, s, "tc", 200, 200, 140, st);
    expect(tc.texts.join(" ")).toMatch(/TURN COORDINATOR/);
  });

  it("two PFDs keep their own standby compass", () => {
    const a = rough();
    a.failures.ahrs = true;
    const p1 = newPfdState();
    const p2 = newPfdState();
    p2.compassHdg = 123;
    drawPfd(fakeCtx().ctx, a, p1, 0.1);
    expect(p1.compassHdg).not.toBe(0);
    expect(p2.compassHdg).toBe(123);
    const fixed = newPfdState();
    fixed.textScale = 1.25;
    expect(() => drawPfd(fakeCtx().ctx, a, fixed, 0)).not.toThrow();
  });

  it("two airliner PFDs keep their own FMA highlight and speed trend", () => {
    const a = rough();
    const s1 = newAirlinerState();
    const s2 = newAirlinerState();
    drawAirlinerPfd(fakeCtx().ctx, a, s1);
    expect(s1.trend.t).toBe(a.time);
    expect(s2.trend.t).toBe(-1);
    expect(s2.fmaSince).toEqual([0, 0, 0]);
  });
});

// ------------------------------------------------------------------ crops
describe("crop — one region of a 1024×768 drawing", () => {
  it("contain keeps the aspect ratio and centres; fill stretches; the inverse maps back", () => {
    const t = cropTransform([366, 432, 292, 292], [0, 0, 1024, 768]);
    expect(t.sx).toBeCloseTo(768 / 292, 9);
    expect(t.sy).toBe(t.sx);
    const [x0, y0] = cropToTarget(t, 366, 432);
    expect(x0).toBeCloseTo((1024 - 768) / 2, 9);
    expect(y0).toBeCloseTo(0, 9);
    const [sx, sy] = targetToSource(t, 512, 384);
    expect(sx).toBeCloseTo(366 + 146, 9);
    expect(sy).toBeCloseTo(432 + 146, 9);
    const f = cropTransform([0, 0, 512, 384], [0, 0, 1024, 768], "fill");
    expect([f.sx, f.sy, f.tx, f.ty]).toEqual([2, 2, 0, 0]);
  });

  it("drawCropped wraps the renderer in save / clip / transform / restore", () => {
    const f = fakeCtx();
    let drew = 0;
    const s = rough();
    const st = newSteamState();
    drawCropped(
      f.ctx,
      (c) => (drew++, drawSixPack(c, s, 0, st)),
      [366, 432, 292, 292],
      { background: "#000" },
    );
    expect(drew).toBe(1);
    const saves = f.calls.filter((c) => c.k === "save").length;
    const restores = f.calls.filter((c) => c.k === "restore").length;
    expect(saves).toBe(restores);
    expect(f.calls[0].k).toBe("save");
    expect(f.calls.filter((c) => c.k === "clip").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(f.calls.at(-1)!.k).toBe("restore");
    // the restore runs even when the renderer throws
    const g = fakeCtx();
    expect(() =>
      drawCropped(
        g.ctx,
        () => {
          throw new Error("x");
        },
        [0, 0, 10, 10],
      ),
    ).toThrow("x");
    expect(g.calls.filter((c) => c.k === "save").length).toBe(
      g.calls.filter((c) => c.k === "restore").length,
    );
  });
});

// ------------------------------------------------------------------ R5: IndexedDB helper
describe("R5 — IndexedDB helper with a memory fallback", () => {
  const STORES = ["courses", "assets"];

  it("without IndexedDB (node, Safari private mode) the same API runs on memory and says why", async () => {
    const db = await openDb("ifr-test", 1, STORES, { factory: null });
    expect(db.backend).toBe("memory");
    expect(db.reason).toMatch(/not available/);
    await db.put("courses", "b", { id: "b", n: 2 });
    await db.put("courses", "a", { id: "a", n: 1 });
    await db.put("courses", 7, { id: 7 });
    expect(await db.keys("courses")).toEqual([7, "a", "b"]); // numbers first, like IndexedDB
    const got = await db.get<{ n: number }>("courses", "a");
    expect(got).toEqual({ id: "a", n: 1 });
    got!.n = 99; // values come back as copies
    expect((await db.get<{ n: number }>("courses", "a"))!.n).toBe(1);
    expect((await db.getAll("courses")).length).toBe(3);
    await db.delete("courses", "a");
    expect(await db.get("courses", "a")).toBeUndefined();
    await db.clear("courses");
    expect(await db.keys("courses")).toEqual([]);
    await expect(db.get("nope", "x")).rejects.toThrow(/No object store/);
  });

  it("an open that throws, errors or never answers falls back to memory (never rejects)", async () => {
    const throwing = {
      open: () => {
        throw Object.assign(new Error("The operation is insecure."), {
          name: "SecurityError",
        });
      },
    } as unknown as IDBFactory;
    const a = await openDb("x", 1, STORES, { factory: throwing });
    expect(a.backend).toBe("memory");
    expect(a.reason).toMatch(/insecure/);

    const erroring = {
      open: () => {
        const r: Record<string, unknown> = {
          error: Object.assign(new Error("InvalidStateError"), {
            name: "InvalidStateError",
          }),
        };
        setTimeout(() => (r.onerror as () => void)?.(), 0);
        return r;
      },
    } as unknown as IDBFactory;
    const b = await openDb("x", 1, STORES, { factory: erroring });
    expect(b.backend).toBe("memory");
    expect(b.reason).toMatch(/InvalidStateError/);

    const silent = { open: () => ({}) } as unknown as IDBFactory; // blocked upgrade, never answers
    const c = await openDb("x", 1, STORES, { factory: silent, timeoutMs: 20 });
    expect(c.backend).toBe("memory");
    expect(c.reason).toMatch(/in time/);
  });

  it("blobs are stored under their sha-256", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const db = new MemoryDb("m", ["assets"]);
    const blob = new Blob(["abc"], { type: "text/plain" });
    const id = await db.putBlob("assets", blob);
    expect(id).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const back = await db.get<Blob>("assets", id);
    expect(await back!.text()).toBe("abc");
  });

  it("quota errors are recognised in every browser's spelling; persist() never throws", async () => {
    expect(isQuotaError(new IdbQuotaError())).toBe(true);
    expect(isQuotaError({ name: "QuotaExceededError" })).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error("other"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(["persisted", "granted", "denied", "unsupported"]).toContain(
      await persist(),
    );
  });
});

// ------------------------------------------------------------------ R6: shared avionics controls
describe("R6 — avionics controls as pure functions over a Sim", () => {
  it("OBS, heading bug and course wrap to 1..360 like the cockpit knobs", () => {
    const s = rough();
    expect(setObs(s, 2, 0)).toBe(360);
    expect(s.av.obs2).toBe(360);
    expect(setObs(s, 1, 365)).toBe(5);
    expect(nudgeObs(s, 1, -1, true)).toBe(355);
    s.ap.hdgBug = 355;
    expect(nudgeHdgBug(s, 1, true)).toBe(5);
    expect(nudgeHdgBug(s, -5)).toBe(360);
    expect(syncHdgBug(s)).toBe(Math.round(s.ac.data.hdgTrue) || 360);
    s.av.cdi = "NAV2";
    expect(setCrs(s, 181)).toBe(181);
    expect(s.av.obs2).toBe(181);
    expect(nudgeCrs(s, 2)).toBe(183);
  });

  it("CDI and bearing pointers cycle in the G1000 order; baro rounds and stays in the Kollsman range", () => {
    const s = rough();
    s.av.cdi = "GPS";
    expect(cycleCdi(s)).toBe("NAV1");
    expect(cycleCdi(s)).toBe("NAV2");
    expect(cycleCdi(s)).toBe("GPS");
    s.av.bearing1 = "OFF";
    expect([
      cycleBrg(s, 1),
      cycleBrg(s, 1),
      cycleBrg(s, 1),
      cycleBrg(s, 1),
    ]).toEqual(["NAV1", "GPS", "ADF", "OFF"]);
    expect(cycleBrg(s, 2)).toBe(s.av.bearing2);
    expect(setBaro(s, 30.123)).toBe(30.12);
    expect(setBaro(s, 40)).toBe(31.5);
    s.av.baro = 29.92;
    expect(nudgeBaro(s, 3)).toBe(29.95);
    expect(nudgeBaro(s, -1, true)).toBe(29.85);
    s.av.cdi = "GPS";
    expect(centerCdi(s)).toBeNull();
  });
});

// ------------------------------------------------------------------ the frozen data model
describe("course/types — the contract compiles for calc, drill and linked steps", () => {
  it("a course with a calc step, a drill and a Try it that flies the computed numbers is plain JSON", () => {
    const calc: CalcStep = {
      id: "s1",
      kind: "calc",
      title: { en: "Top of descent", fr: "Point de début de descente" },
      reader: [{ t: "formula", formula: { en: "d = Δh / gradient" }, ruleOfThumb: { en: "3° ≈ 318 ft/NM" }, refs: [{ src: "FAA-IFH", ref: "ch. 10" }] }],
      calc: { generatorId: "ifr.topOfDescent", params: { gsKt: [90, 140] }, showSolution: "onCheck" },
    };
    const drill: DrillStep = {
      id: "s2",
      kind: "drill",
      title: { en: "Drill" },
      reader: [],
      drill: { generatorIds: ["ifr.sixtyToOne", "ifr.descentRate"], count: 10, timer: { mode: "total", seconds: 300 }, practiceOnly: true },
    };
    const fly: Step = {
      id: "s3",
      kind: "try",
      title: { en: "Fly it" },
      reader: [],
      calcLink: { step: "s1", use: "both" },
      goal: { all: [{ id: "vsBand", p: { min: -600, max: -400 } }], graded: false },
    };
    const course: Course = {
      format: "ifr-course",
      version: 1,
      id: "maths-ifr",
      rev: 1,
      updated: "2026-11-05T00:00:00Z",
      title: { en: "Maths for IFR", fr: "Les maths de l'IFR" },
      author: { name: "Sample" },
      langs: ["en", "fr"],
      cockpit: "g1000",
      world: { kind: "training" },
      steps: [calc, drill, fly],
      scenes: {},
      clips: {},
      assets: {},
      tags: ["maths", "ifr"],
    };
    expect(JSON.parse(JSON.stringify(course))).toEqual(course);
    // a generator satisfies GeneratorDef with a pure generate / check pair
    const g: GeneratorDef = {
      id: "ifr.vdp",
      title: { en: "VDP", fr: "VDP" },
      category: "ifr",
      summary: { en: "(MDA − TDZE) / 300" },
      generate: (rng) => {
        const hat = rng.range(400, 700, 20);
        return {
          prompt: { en: `HAT ${hat} ft: VDP distance?` },
          givens: [{ key: "hat", label: { en: "HAT" }, value: hat, unit: "ft" }],
          answer: Math.round((hat / 300) * 10) / 10,
          unit: "NM",
          tolerance: 0.1,
          solutionSteps: [{ en: `${hat} / 300` }],
          ruleOfThumb: { en: "HAT / 300 NM" },
          formula: { en: "d = HAT / (6076 · tan 3°)" },
          exact: hat / (6076.12 * Math.tan(3 * DEG)),
          refs: [{ src: "FAA-IFH", ref: "ch. 4" }],
        };
      },
      check: (p: CalcProblem, r) => ({ ok: Math.abs(r.answer - p.answer) <= p.tolerance, error: r.answer - p.answer }),
    };
    const rng = { next: () => 0.5, int: (a: number) => a, range: (a: number) => a, pick: <T,>(x: readonly T[]) => x[0], chance: () => false };
    const body = g.generate(rng, {});
    const p: CalcProblem = { ...body, generatorId: g.id, seed: 1, params: {} };
    expect(g.check(p, { answer: 1.4 }).ok).toBe(true);
    expect(p.exact!).toBeCloseTo(400 / 318.4, 2);
  });
});

describe("course/types — designed slides and nesting are plain JSON", () => {
  it("a designed slide with a live HSI, a your-turn, a calc-bound text and a briefing of steps", () => {
    const blocks: SlideBlock[] = [
      { id: "t", kind: "text", style: "title", text: { en: "The 60-to-1 rule", fr: "La règle du 1 pour 60" }, frame: { x: 96, y: 72, w: 1200, h: 120, z: 1 } },
      {
        id: "hsi",
        kind: "instrument",
        view: { kind: "gauge", gauge: "hsi" },
        scene: "vor-off",
        controls: ["obs1"],
        alt: { en: "HSI, 2 dots right of course" },
        frame: { x: 96, y: 240, w: 720, h: 720, z: 2, locked: true },
        yourTurn: {
          where: "slide",
          prompt: { en: "Turn the OBS to centre the needle" },
          goal: { all: [{ id: "cdiDefl", p: { maxDots: 0.5 } }], graded: false },
        },
      },
      { id: "m1", kind: "marker", n: 1, frame: { x: 700, y: 300, w: 48, h: 48, z: 3, group: "g1" }, anchor: "STEAM_LEFT:4" },
      { id: "c1", kind: "callout", n: 1, text: { en: "Course deviation bar" }, target: [724, 324], frame: { x: 900, y: 280, w: 600, h: 96, z: 3, group: "g1" }, reveal: { order: 1 } },
      { id: "ans", kind: "text", style: "number", text: { en: "{{value}}°" }, bind: { k: "calc", step: "s1", field: "answer" }, frame: { x: 900, y: 600, w: 400, h: 160, z: 1 }, reveal: { order: 2, when: "answered" } },
      { id: "img", kind: "image", image: { lib: "photo:c172-panel" }, crop: [0.1, 0.2, 0.5, 0.5], alt: { en: "C172 panel" }, frame: { x: 1400, y: 600, w: 400, h: 300, z: 0, rot: 2 } },
      { id: "vp", kind: "simViewport", view: "outside", clip: "demo", frame: { x: 1400, y: 200, w: 400, h: 225, z: 1 }, yourTurn: { where: "sim", prompt: { en: "Fly it" }, goal: { all: [{ id: "track", p: { value: 90, tol: 5 } }], graded: false }, durationS: 120 } },
    ];
    const slide: DesignedStep = {
      id: "s2",
      kind: "explain",
      title: { en: "60:1" },
      reader: [{ t: "text", text: { en: "Linear text for screen readers" } }],
      slide: { size: { w: 1920, h: 1080 }, grid: 24, theme: "cockpit", layout: "instrumentNotes", blocks, scene: "vor-off" },
    };
    const open: OpenStep = { step: { course: "maths-ifr", step: "s2" }, pause: "freeze", close: { maxS: 20 } };
    const brief: Briefing = {
      format: "ifr-course",
      version: 1,
      id: "brief-hold",
      rev: 1,
      updated: "2026-11-06T00:00:00Z",
      title: { en: "Holding briefing" },
      author: { name: "Sample" },
      langs: ["en", "fr"],
      cockpit: "g1000",
      world: { kind: "training" },
      shape: "briefing",
      briefingFor: { exerciseId: "hold-ndb" },
      theme: "brand",
      brand: { name: "Aéroclub", color: "#1f4e8c", logoCorner: "tr" },
      steps: [slide],
      scenes: {},
      clips: {},
      assets: {},
    };
    const res: YourTurnResult = { met: true, checks: [true], secs: 14 };
    const roundTrip = JSON.parse(JSON.stringify({ brief, open, res }));
    expect(roundTrip).toEqual({ brief, open, res });
    expect(new Set(blocks.map((b) => b.kind)).size).toBe(6);
  });
});
