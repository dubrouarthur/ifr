// « Situation de vol » (src/course/situations.ts): the form's model stays inside the aircraft's limits, an impossible
// combination is explained, « Stabiliser » keeps what the flight model really does, the ready situations are steady
// flights of this aircraft, a situation survives the round trip through a stored scene, and the goal sentences of
// « À vous » give checks the player knows.
import { describe, expect, it } from "vitest";
import { Sim } from "../src/sim/sim";
import { AIRFRAME } from "../src/sim/aircraft";
import { applyScene, validateScene, verifyOf } from "../src/course/scene";
import {
  GOAL_SENTENCES,
  READY_SITUATIONS,
  SIT_LIMITS,
  checkSituation,
  climbRange,
  defaultSituation,
  editSituation,
  ilsList,
  levelPower,
  navStations,
  pitchFor,
  placeAt,
  posLine,
  powerNeeded,
  sceneOfSituation,
  sentenceOf,
  sentencesFor,
  sitLabel,
  situationOfScene,
  stabilise,
  stallKt,
  stations,
  yourTurnFor,
  SIM_CONTENTS,
  blockSceneId,
  joinBlock,
  planSituation,
  repointSlide,
  sceneUsedElsewhere,
  sharedWith,
  simContentDraft,
  splitBlock,
  type Situation,
} from "../src/course/situations";
import { validateCourse } from "../src/course/validate";
import { allSamples } from "../src/course/samples/index";
import type { Course, SlideBlock, SlideCanvas, Step } from "../src/course/types";
import { demoScene } from "../src/course/canvas/factory";
import { goalLabel, goalParamIssues } from "../src/course/goals";

const sit = (over: Partial<Situation> = {}): Situation => ({ ...defaultSituation(), ...over });
const errors = (s: Situation) => checkSituation(s).filter((i) => i.level === "error");

describe("situation: limits and editing", () => {
  it("takes its limits from the aircraft", () => {
    expect(SIT_LIMITS.iasKt.min).toBe(AIRFRAME.vso);
    expect(SIT_LIMITS.iasKt.max).toBe(AIRFRAME.vne);
    expect(stallKt(0, 0)).toBe(AIRFRAME.vs1);
    expect(stallKt(3, 0)).toBe(AIRFRAME.vso);
    expect(stallKt(0, 60)).toBeCloseTo(AIRFRAME.vs1 * Math.SQRT2, 1);
  });
  it("keeps every edited value inside the limits and wraps the heading", () => {
    const s = editSituation(sit(), { hdg: 365, bank: 80, power: 140, flaps: 7, altFt: -50, obs1: -10 });
    expect(s.hdg).toBe(5);
    expect(s.bank).toBe(60);
    expect(s.power).toBe(100);
    expect(s.flaps).toBe(3);
    expect(s.altFt).toBe(0);
    expect(s.obs1).toBe(350);
  });
  it("forgets the trim when a flight value changes, keeps it for a heading or a radio", () => {
    const t = { ...sit(), trimmed: { pitch: 2, trim: -0.3 } };
    expect(editSituation(t, { hdg: 90 }).trimmed).toBeDefined();
    expect(editSituation(t, { obs1: 90 }).trimmed).toBeDefined();
    expect(editSituation(t, { power: 80 }).trimmed).toBeUndefined();
    expect(editSituation(t, { iasKt: 80 }).trimmed).toBeUndefined();
  });
  it("shows slow flight nose up and a descent nose down", () => {
    expect(pitchFor(sit({ iasKt: 60 }))).toBeGreaterThan(pitchFor(sit({ iasKt: 110 })) + 5);
    expect(pitchFor(sit({ vsFpm: -700 }))).toBeLessThan(pitchFor(sit()) - 2);
    expect(pitchFor(sit({ bank: 45 }))).toBeGreaterThan(pitchFor(sit()));
  });
});

describe("situation: an impossible combination is explained", () => {
  it("accepts the default and the standard turn", () => {
    expect(errors(sit())).toEqual([]);
    expect(errors(sit({ bank: -15 }))).toEqual([]);
  });
  it("explains a speed under the stall, with the bank that raises it, and offers a way out", () => {
    const [i] = errors(sit({ iasKt: 50, bank: 45 }));
    expect(i.field).toBe("iasKt");
    expect(i.text.fr).toMatch(/45° d’inclinaison.*décroche vers 57 kt/);
    expect(errors(editSituation(sit({ iasKt: 50, bank: 45 }), i.fix!.patch))).toEqual([]);
    expect(errors(sit({ iasKt: 44 }))[0].text.fr).toMatch(/Volets rentrés/);
    expect(errors(sit({ iasKt: 44, flaps: 3, power: 60 })).filter((x) => x.field === "iasKt")).toEqual([]);
  });
  it("explains a climb the engine cannot give, with the figure it can", () => {
    const [i] = errors(sit({ vsFpm: 1200, iasKt: 100, altFt: 8000, power: 100 }));
    expect(i.field).toBe("power");
    expect(i.text.fr).toMatch(/n’a pas la puissance/);
  });
  it("explains a descent the aircraft cannot make at that speed", () => {
    const [i] = errors(sit({ vsFpm: -1500, iasKt: 70, power: 0 }));
    expect(i.field).toBe("vsFpm");
    expect(i.text.fr).toMatch(/Même moteur réduit/);
    expect(errors(editSituation(sit({ vsFpm: -1500, iasKt: 70, power: 0 }), i.fix!.patch))).toEqual([]);
  });
  it("explains an altitude under the ground and flaps above their speed", () => {
    expect(errors(sit({ altFt: 200 }))[0].text.fr).toMatch(/Le sol est à/);
    const w = checkSituation(sit({ flaps: 3, iasKt: 100 })).find((i) => i.field === "flaps");
    expect(w?.level).toBe("warn");
    expect(w?.text.fr).toMatch(/limités à 85 kt/);
  });
  it("says that the power and the speed do not go together until it is stabilised", () => {
    const i = checkSituation(sit({ power: 40 })).find((x) => x.level === "info");
    expect(i?.text.fr).toMatch(/40 % de puissance ne tient pas le palier à 100 kt/);
    const st = stabilise(sit({ power: 40 }), "power");
    expect(st.ok).toBe(true);
    expect(checkSituation(st.sit).some((x) => x.level === "info")).toBe(false);
  });
});

describe("situation: « Stabiliser » keeps what the aircraft does", () => {
  it("less power in level flight gives less speed; more gives more", () => {
    const lo = stabilise(sit({ power: 45 }), "power");
    const hi = stabilise(sit({ power: 80 }), "power");
    expect(lo.ok && hi.ok).toBe(true);
    expect(lo.sit.iasKt).toBeLessThan(95);
    expect(hi.sit.iasKt).toBeGreaterThan(108);
    expect(lo.sit.vsFpm).toBe(0);
    expect(lo.sit.trimmed).toBeDefined();
    expect(lo.text.fr).toMatch(/Stable : avec 45 % de puissance, l’avion vole à \d+ kt/);
  });
  it("a speed asked finds its power", () => {
    const r = stabilise(sit({ iasKt: 90, power: 100 }), "speed");
    expect(r.ok).toBe(true);
    expect(Math.abs(r.sit.iasKt - 90)).toBeLessThanOrEqual(1);
    expect(r.sit.power).toBeGreaterThan(38);
    expect(r.sit.power).toBeLessThan(60);
  });
  it("a climb beyond the engine is brought back to what full power gives, and said", () => {
    const r = stabilise(sit({ iasKt: 80, vsFpm: 1100, power: 100 }), "speed");
    expect(r.ok).toBe(true);
    expect(r.sit.power).toBe(100);
    expect(r.sit.vsFpm).toBeLessThan(800);
    expect(r.sit.vsFpm).toBeGreaterThan(400);
    expect(r.text.fr).toMatch(/À pleine puissance/);
  });
  it("too little power for the climb asked ends at the stall and is explained, nothing changed", () => {
    const start = sit({ iasKt: 70, vsFpm: 700, power: 30 });
    const r = stabilise(start, "power");
    expect(r.ok).toBe(false);
    expect(r.sit).toEqual(start);
    expect(r.text.fr).toMatch(/ne tient pas la montée à 700 ft\/min.*décrochage/);
  });
  it("the steady situation stays steady when it goes live (no zoom, no dive)", () => {
    const r = stabilise(sit({ power: 70 }), "power");
    const sim = new Sim();
    applyScene(sim, sceneOfSituation(r.sit));
    sim.paused = false;
    const alt0 = sim.ac.s.altFt;
    for (let i = 0; i < 30 * 12; i++) sim.step(1 / 30);
    expect(Math.abs(sim.ac.s.altFt - alt0)).toBeLessThan(120);
    expect(Math.abs(sim.ac.data.iasKt - r.sit.iasKt)).toBeLessThan(5);
  });
  it("the table the hints use follows the flight model", () => {
    for (const s of [sit(), sit({ iasKt: 80, altFt: 6000 }), sit({ iasKt: 110, altFt: 2000 }), sit({ iasKt: 70, flaps: 2 }), sit({ bank: 45 })]) {
      const r = stabilise(s, "speed");
      expect(Math.abs(r.sit.power - levelPower(s)), JSON.stringify(s)).toBeLessThan(9);
    }
    const up = stabilise(sit({ iasKt: 75, altFt: 3000, vsFpm: 2000, power: 100 }), "speed");
    expect(Math.abs(up.sit.vsFpm - climbRange(sit({ iasKt: 75, altFt: 3000 })).up)).toBeLessThan(120);
    expect(powerNeeded(sit({ vsFpm: 300, iasKt: 80, altFt: 2000 }))).toBeGreaterThan(powerNeeded(sit({ iasKt: 80, altFt: 2000 })));
  });
});

describe("situations prêtes", () => {
  it("offers at least twelve, named in French and English, with unique ids", () => {
    expect(READY_SITUATIONS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(READY_SITUATIONS.map((r) => r.id)).size).toBe(READY_SITUATIONS.length);
    for (const r of READY_SITUATIONS) {
      expect(r.name.fr, r.id).toBeTruthy();
      expect(r.name.en, r.id).toBeTruthy();
      expect(r.note.fr, r.id).toBeTruthy();
    }
    const names = READY_SITUATIONS.map((r) => r.name.fr).join(" | ");
    for (const want of ["En palier", "Montée à VY", "Descente à 500", "Virage standard à gauche", "Virage à 45°", "Vol lent", "Finale ILS 27 à 5 NM", "rapprochement d’un VOR", "Travers d’un NDB", "Dans l’attente", "Panne de dépression", "De nuit"])
      expect(names).toContain(want);
  });
  it("each one is valid for the aircraft: no error, no pending hint, applies without a difference", () => {
    for (const r of READY_SITUATIONS) {
      expect(checkSituation(r.sit).filter((i) => i.level !== "warn"), r.id).toEqual([]);
      const scene = sceneOfSituation(r.sit, { id: `ready-${r.id}` });
      const sim = new Sim();
      expect(applyScene(sim, scene), r.id).toEqual([]);
      expect(validateScene(scene).issues.filter((i) => i.level === "error"), r.id).toEqual([]);
      expect(Math.round(sim.ac.data.hdgTrue) % 360, r.id).toBe(r.sit.hdg % 360);
      expect(Math.abs(sim.ac.data.rollDeg - r.sit.bank), r.id).toBeLessThan(0.5);
    }
  });
  it("each one is a steady flight: the model holds its speed and its path with about the power shown", () => {
    for (const r of READY_SITUATIONS) {
      const st = stabilise(r.sit, "speed");
      expect(st.ok, r.id).toBe(true);
      expect(Math.abs(st.sit.vsFpm - r.sit.vsFpm), r.id).toBeLessThanOrEqual(50);
      expect(Math.abs(st.sit.iasKt - r.sit.iasKt), r.id).toBeLessThanOrEqual(2);
      expect(Math.abs(st.sit.power - r.sit.power), `${r.id} power ${st.sit.power}`).toBeLessThanOrEqual(8);
    }
  });
  it("the ILS final is on the localizer and the glide path; the VOR bar is centred; the NDB is abeam", () => {
    const at = (id: string) => {
      const sim = new Sim();
      applyScene(sim, sceneOfSituation(READY_SITUATIONS.find((r) => r.id === id)!.sit));
      return sim;
    };
    const ils = at("ils27");
    expect(Math.abs(ils.av.nav1.active - 110.3)).toBeLessThan(0.01);
    expect(Math.abs(verifyOf(ils).cdiDots ?? 9)).toBeLessThan(0.3);
    expect(Math.abs(verifyOf(ils).gsDots ?? 9)).toBeLessThan(0.5);
    expect(Math.abs(verifyOf(at("vor-inbound")).cdiDots ?? 9)).toBeLessThan(0.2);
    expect(at("vacuum").failures.vacuum).toBe(true);
    expect(at("hold").fp.wpts.some((w) => w.hold)).toBe(true);
  });
});

describe("situation ⇄ stored scene", () => {
  it("a situation survives JSON and opens the form as it was left", () => {
    for (const r of READY_SITUATIONS) {
      const scene = JSON.parse(JSON.stringify(sceneOfSituation(r.sit, { id: "x" })));
      expect(situationOfScene(scene), r.id).toEqual(editSituation(r.sit, {}));
    }
  });
  it("editing keeps the scene's identity: id, cockpit, seed", () => {
    const base = { ...demoScene("steam"), seed: 7 };
    const s = situationOfScene(base);
    const next = sceneOfSituation(editSituation(s, { hdg: 270 }), { base });
    expect(next.id).toBe(base.id);
    expect(next.cockpit).toBe("steam");
    expect(next.seed).toBe(7);
    expect(next.pose.kind).toBe("fields");
    const sim = new Sim();
    applyScene(sim, next);
    expect(Math.round(sim.ac.data.hdgTrue)).toBe(270);
  });
  it("reads a scene that has no stored situation (a hand-written or captured one) from its instruments", () => {
    const s = situationOfScene(demoScene());
    expect(s.hdg).toBe(120);
    expect(s.altFt).toBe(4000);
    expect(s.iasKt).toBe(100);
    expect(s.nav1).toBe("ARD");
    expect(s.pos).toEqual({ kind: "radial", station: "ARD", radial: 276, distNm: 6 });
    expect(s.wind).toEqual({ dir: 250, kt: 10 });
    // and what the instruments read does not move when it is stored back untouched
    const a = new Sim();
    const b = new Sim();
    applyScene(a, demoScene());
    applyScene(b, sceneOfSituation(s, { base: demoScene() }));
    expect(Math.abs(a.ac.data.pitchDeg - b.ac.data.pitchDeg)).toBeLessThan(0.2);
    expect(b.av.obs1).toBe(a.av.obs1);
    expect(b.av.nav1.active).toBe(a.av.nav1.active);
  });
  it("names a situation and its position in plain words", () => {
    expect(sitLabel(sit({ hdg: 5, bank: -15, vsFpm: 500 }))).toBe("005° · 3 000 ft · 100 kt · +500 ft/min · 15° L");
    expect(posLine({ kind: "ils", airport: "PARD", rwy: "27", distNm: 5 }, "fr")).toBe("ILS 27 de PARD · 5 NM");
    expect(posLine({ kind: "hold", fix: "ARD", inbound: 270, turn: "R" }, "fr")).toMatch(/Dans l’attente à ARD/);
    expect(posLine({ kind: "radial", station: "PA", radial: 270, distNm: 3 }, "fr")).toMatch(/PA · relèvement 270 · 3 NM/);
  });
  it("placing the aircraft on the ILS sets what goes with it and says so", () => {
    const ils = ilsList().find((i) => i.rwy === "27")!;
    const { sit: s, set } = placeAt(sit({ iasKt: 120 }), { kind: "ils", airport: ils.airport, rwy: ils.rwy, distNm: 5 });
    expect(s.hdg).toBe(270);
    expect(s.nav1).toBe(ils.ident);
    expect(s.obs1).toBe(270);
    expect(s.altFt).toBeGreaterThan(1900);
    expect(s.altFt).toBeLessThan(2200);
    expect(s.vsFpm).toBeLessThan(0);
    expect(set?.fr).toMatch(/NAV1 sur IPRD/);
    expect(stations().some((x) => x.kind === "NDB")).toBe(true);
    expect(navStations().some((x) => x.kind === "ILS")).toBe(true);
  });
});

describe("« Ce qu’on lui demande »: goal sentences", () => {
  it("each sentence is written with the situation's numbers, in both languages, and gives known checks", () => {
    const s = sit({ hdg: 270, altFt: 3000, iasKt: 100 });
    for (const g of GOAL_SENTENCES) {
      const t = g.text(s);
      expect(t.fr, g.id).toBeTruthy();
      expect(t.en, g.id).toBeTruthy();
      expect(g.controls.length, g.id).toBeGreaterThan(0);
      const checks = g.checks(s);
      expect(checks.length, g.id).toBeGreaterThan(0);
      // the player can evaluate every check (goals.ts knows the id)
      for (const c of checks) {
        expect(goalLabel(c, "fr"), g.id).toBeTruthy();
        expect(goalParamIssues(c, "fr"), g.id).toEqual([]);
      }
    }
    expect(GOAL_SENTENCES.find((g) => g.id === "holdHeading")!.text(s).fr).toBe("Tenir le cap 270 ± 10° pendant 10 s");
    expect(GOAL_SENTENCES.find((g) => g.id === "centreBar")!.text(s).fr).toBe("Centrer la barre avec l’OBS");
  });
  it("makes a ready « À vous »: task, goal, controls, and finds its sentence again", () => {
    const s = sit({ hdg: 90 });
    const g = GOAL_SENTENCES.find((x) => x.id === "holdHeading")!;
    const yt = yourTurnFor(g, s, "slide", "sc-1");
    expect(yt.prompt.fr).toBe("À vous : tenir le cap 090 ± 10° pendant 10 s.");
    expect(yt.controls).toEqual(["bank"]);
    expect(yt.goal.holdS).toBe(10);
    expect(yt.goal.all).toEqual([{ id: "heading", p: { value: 90, tol: 10 } }]);
    expect(yt.scene).toBe("sc-1");
    expect(sentenceOf(yt, s)?.id).toBe("holdHeading");
    const sim = yourTurnFor(GOAL_SENTENCES.find((x) => x.id === "flyIls")!, s, "sim");
    expect(sim.controls).toBeUndefined();
    expect(sim.durationS).toBeGreaterThanOrEqual(60);
  });
  it("puts the natural sentence first", () => {
    expect(sentencesFor("slide", sit(), true)[0].id).toBe("centreBar");
    expect(sentencesFor("slide", sit())[0].id).toBe("holdHeading");
    expect(sentencesFor("slide", sit({ bank: 30 }))[0].id).toBe("bank30");
    expect(sentencesFor("sim", sit({ pos: { kind: "ils", airport: "PARD", rwy: "27", distNm: 5 } }))[0].id).toBe("flyIls");
    expect(sentencesFor("slide", sit()).some((g) => g.id === "flyIls")).toBe(false);
  });
});

describe("a slide and its situation", () => {
  const inst = (id: string, scene?: string): SlideBlock =>
    ({ id, kind: "instrument", view: { kind: "six" }, frame: { x: 0, y: 0, w: 600, h: 450 }, ...(scene ? { scene } : {}) }) as SlideBlock;
  const slide = (blocks: SlideBlock[], scene?: string): SlideCanvas => ({ blocks, ...(scene ? { scene } : {}) }) as SlideCanvas;
  const course = (steps: Step[], scenes: Course["scenes"] = {}): Course =>
    ({ id: "c", cockpit: "steam", steps, scenes, clips: {} }) as unknown as Course;
  const step = (id: string, sl: SlideCanvas): Step => ({ id, kind: "explain", slide: sl }) as unknown as Step;

  it("says in numbers who shares a situation", () => {
    const sl = slide([inst("a"), inst("b"), inst("c", "own")], "s1");
    expect(blockSceneId(sl, "a")).toEqual({ id: "s1", own: false });
    expect(blockSceneId(sl, "c")).toEqual({ id: "own", own: true });
    expect(sharedWith(sl, "a")).toBe(1);
    expect(sharedWith(sl, "c")).toBe(0);
    expect(sharedWith(sl)).toBe(2);
  });
  it("the first edit of the sample situation gives the slide a scene of its own, in the course's cockpit", () => {
    const sl = slide([inst("a"), inst("b")]);
    const c = course([step("s", sl)]);
    const plan = planSituation(c, "s", undefined, sit({ hdg: 270 }), demoScene("g1000"));
    expect(plan.isNew).toBe(true);
    expect(plan.scene.id).toBe(plan.sceneId);
    expect(plan.scene.id).not.toBe("lib:demo");
    expect(plan.scene.cockpit).toBe("steam");
    const next = repointSlide(sl, undefined, plan.sceneId);
    expect(next.scene).toBe(plan.sceneId);
    expect(sharedWith(next, "a")).toBe(1);
    // the next edit stays in that scene
    const c2 = course([step("s", next)], { [plan.sceneId]: plan.scene });
    const again = planSituation(c2, "s", plan.sceneId, sit({ hdg: 90 }));
    expect(again.isNew).toBe(false);
    expect(again.sceneId).toBe(plan.sceneId);
    expect(again.scene.situation?.hdg).toBe(90);
  });
  it("a situation other steps show too is copied before it is changed here", () => {
    const shared = sceneOfSituation(sit(), { id: "shared" });
    const a = slide([inst("a")], "shared");
    const b = slide([inst("b")], "shared");
    const c = course([step("s1", a), step("s2", b)], { shared });
    expect(sceneUsedElsewhere(c, "shared", "s1")).toBe(true);
    const plan = planSituation(c, "s1", "shared", sit({ altFt: 5000 }));
    expect(plan.isNew).toBe(true);
    expect(plan.sceneId).not.toBe("shared");
    expect(c.scenes.shared.situation?.altFt).toBe(3000);
    const next = repointSlide(a, "shared", plan.sceneId);
    expect(next.scene).toBe(plan.sceneId);
    // alone in the course: edited in place
    const solo = course([step("s1", a)], { shared });
    expect(planSituation(solo, "s1", "shared", sit({ altFt: 5000 })).isNew).toBe(false);
  });
  it("an element can take its own situation and give it back", () => {
    const base = sceneOfSituation(sit({ hdg: 120 }), { id: "s1" });
    const sl = slide([inst("a"), inst("b")], "s1");
    const c = course([step("s", sl)], { s1: base });
    const r = splitBlock(c, sl, "a", demoScene())!;
    expect(r.scene.id).not.toBe("s1");
    expect(r.scene.situation?.hdg).toBe(120);
    expect(blockSceneId(r.slide, "a")).toEqual({ id: r.scene.id, own: true });
    expect(blockSceneId(r.slide, "b")).toEqual({ id: "s1", own: false });
    // its own edit points only that block at a new scene
    const moved = repointSlide(r.slide, r.scene.id, "s9", "a");
    expect(moved.scene).toBe("s1");
    expect(blockSceneId(moved, "a").id).toBe("s9");
    const back = joinBlock(r.slide, "a");
    expect(blockSceneId(back, "a")).toEqual({ id: "s1", own: false });
    expect("scene" in back.blocks[0]).toBe(false);
  });
  it("a goal that named the old scene follows the slide to its new one", () => {
    const yt = yourTurnFor(GOAL_SENTENCES[0], sit(), "slide", "s1");
    const sl = slide([{ ...inst("a", "s1"), yourTurn: yt } as SlideBlock], "s1");
    const next = repointSlide(sl, "s1", "s2");
    const b = next.blocks[0] as Extract<SlideBlock, { kind: "instrument" }>;
    expect(b.scene).toBe("s2");
    expect(b.yourTurn?.scene).toBe("s2");
  });
});

describe("« Ajouter » : four simulator contents that land ready to work", () => {
  it("offers four plain choices, named in both languages", () => {
    expect(SIM_CONTENTS.map((c) => c.kind)).toEqual(["live", "yourTurn", "moment", "flight"]);
    expect(SIM_CONTENTS.map((c) => c.name.fr)).toEqual([
      "Instrument vivant",
      "À vous sur l’instrument",
      "Moment de vol",
      "Vol dans le simulateur",
    ]);
    for (const c of SIM_CONTENTS) expect(c.line.fr && c.line.en).toBeTruthy();
  });
  it("never an empty shell: live instrument, controls ticked, goal written with the situation", () => {
    const s = sit({ hdg: 270 });
    const live = simContentDraft("live", s, "steam");
    expect(live.kind === "instrument" && live.mode).toBe("live");
    expect(live.kind === "instrument" && live.view).toEqual({ kind: "six" });
    const yt = simContentDraft("yourTurn", s, "g1000");
    if (yt.kind !== "instrument") throw new Error("instrument expected");
    expect(yt.view).toEqual({ kind: "pfd" });
    expect(yt.mode).toBe("live");
    expect(yt.controls).toEqual(["bank"]);
    expect(yt.yourTurn?.prompt.fr).toBe("À vous : tenir le cap 270 ± 10° pendant 10 s.");
    expect(yt.yourTurn?.where).toBe("slide");
    const flight = simContentDraft("flight", sit({ pos: { kind: "ils", airport: "PARD", rwy: "27", distNm: 5 } }), "g1000");
    if (flight.kind !== "simViewport") throw new Error("sim view expected");
    expect(flight.yourTurn?.where).toBe("sim");
    expect(flight.yourTurn?.goal.all.map((c) => c.id)).toEqual(["cdiDefl", "gsDefl"]);
    const moment = simContentDraft("moment", s, "g1000", "clip-1");
    expect(moment.kind === "simViewport" && moment.clip).toBe("clip-1");
  });
  it("a course with these contents and an edited situation still validates and still loads", () => {
    const base = allSamples().find((c) => c.steps.some((s) => s.slide))!;
    const stepIdx = base.steps.findIndex((s) => s.slide);
    const st = base.steps[stepIdx];
    const plan = planSituation(base, st.id, st.slide!.scene, sit({ hdg: 270, bank: -15 }), demoScene(base.cockpit));
    const blocks = (["live", "yourTurn", "moment", "flight"] as const).map((k, i) => ({
      ...simContentDraft(k, plan.scene.situation!, base.cockpit),
      id: `sim-${i}`,
      frame: { x: 96 + i * 24, y: 96 + i * 24, w: 480, h: 360, z: 50 + i },
    })) as SlideBlock[];
    const slide = { ...repointSlide(st.slide!, st.slide!.scene, plan.sceneId), blocks: [...st.slide!.blocks, ...blocks] };
    const course: Course = JSON.parse(
      JSON.stringify({
        ...base,
        scenes: { ...base.scenes, [plan.sceneId]: plan.scene },
        steps: base.steps.map((s, i) => (i === stepIdx ? { ...s, slide } : s)),
      }),
    );
    const errs = (c: Course) => validateCourse(c).filter((i) => i.level === "error");
    expect(errs(course).map((i) => i.message)).toEqual(errs(base).map((i) => i.message));
    expect(situationOfScene(course.scenes[plan.sceneId]).bank).toBe(-15);
    const sim = new Sim();
    expect(applyScene(sim, course.scenes[plan.sceneId])).toEqual([]);
  });
});
