// Failure drills in the flight builder (procedures mode): the new triggers (height above ground climbing /
// descending, random window drawn from a recorded seed, instructor), the runtime hook the procedure runner listens
// to, backward compatibility of saved circuits and share links, the club templates at a training and a real-world
// airport, and the validation messages (FR / EN).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { Sim } from "../src/sim/sim";
import { LessonRun, type DrillFailureEvent } from "../src/train/engine";
import {
  PRESET_CIRCUITS,
  circuitToExercise,
  circuitStore,
  decodeCircuit,
  encodeCircuit,
  newCircuit,
  planFailures,
  triggerText,
  validate,
  type Circuit,
} from "../src/train/circuits";
import {
  DRILL_TEMPLATES,
  applyMode,
  applyPhase,
  buildDrill,
  listDrills,
  procedureChoices,
  suggestProcedure,
  groupKeys,
} from "../src/train/drills";
import { failureMarks, planGeometry } from "../src/ui/routeMap";
import { cruiseAlt, applyWx } from "../src/train/drills";
import { runway } from "../src/nav/data";
import { setLang } from "../src/ui/i18n";
import { bearingDeg, distanceNm } from "../src/nav/geo";

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

const fly = (
  sim: Sim,
  r: LessonRun,
  sec: number,
  each?: () => boolean | void,
) => {
  for (let t = 0; t < sec; t += 1 / 30) {
    sim.step(1 / 30);
    r.update(1 / 30);
    if (each?.()) return;
  }
};
const hooked = (r: LessonRun) => {
  const got: DrillFailureEvent[] = [];
  r.onDrillFailure = (_k, _e, _m, ev) => got.push(ev);
  return got;
};

describe("failure triggers", () => {
  it("altAgl climbing: fires climbing through the height, announces the expected procedure", () => {
    const c = buildDrill("d-efato", {
      airport: "PARD",
      phase: "climbout",
      lang: "en",
    })!;
    expect(c.start.type === "runway" && c.start.airborne).toBe(500);
    c.failures = [
      {
        key: "engine",
        trigger: "altAgl",
        at: 650,
        dir: "climb",
        expect: "c172.efato",
      },
    ];
    expect(validate(c)).toEqual([]);
    const sim = new Sim();
    const r = new LessonRun(circuitToExercise(c), sim);
    const got = hooked(r);
    let aglAtFire = 0;
    fly(sim, r, 60, () => {
      if (got.length && !aglAtFire) aglAtFire = sim.ac.data.aglFt;
      return got.length > 0;
    });
    expect(got.length).toBe(1);
    expect(sim.failures.engine).toBe(true);
    expect(aglAtFire).toBeGreaterThan(640);
    expect(aglAtFire).toBeLessThan(700);
    expect(got[0]).toMatchObject({
      key: "engine",
      expect: "c172.efato",
      mode: "training",
      isDrill: true,
      trigger: "altAgl",
      byInstructor: false,
    });
    expect(got[0].procedureId).toMatch(/^c172\.efato/);
    // the emergency takes the flight off its clearance: tolerances stop counting
    expect(r.checksSuspended).toBe(true);
    expect(sim.rec.events.some((e) => /Expected procedure/.test(e.text))).toBe(
      true,
    );
  });

  it("altAgl descending: fires only on the way down", () => {
    const c: Circuit = {
      ...newCircuit(),
      drill: { mode: "test" },
      start: {
        type: "air",
        fix: "ARD",
        bearing: 90,
        distNm: 10,
        altFt: 2500,
        hdg: null,
        iasKt: 80,
      },
      legs: [{ type: "fix", ident: "ARD", alt: null }],
      failures: [
        { key: "alternator", trigger: "altAgl", at: 1800, dir: "descent" },
      ],
    };
    expect(validate(c)).toEqual([]);
    const sim = new Sim();
    const r = new LessonRun(circuitToExercise(c), sim);
    const got = hooked(r);
    fly(sim, r, 3);
    expect(got.length).toBe(0);
    const agl0 = sim.ac.data.aglFt;
    expect(agl0).toBeGreaterThan(1800);
    sim.controls.throttle = 0;
    fly(sim, r, 120, () => got.length > 0);
    expect(got.length).toBe(1);
    expect(sim.ac.data.aglFt).toBeLessThanOrEqual(1805);
    expect(got[0].mode).toBe("test");
    // test mode: the expected procedure is not announced in the flight log
    expect(sim.rec.events.some((e) => /Expected procedure/.test(e.text))).toBe(
      false,
    );
  });

  it("random window: drawn from a seed (recorded per attempt), inside the window, replayable", () => {
    const c = buildDrill("d-club-test", { airport: "PARD", lang: "en" })!;
    expect(
      c.failures.every((f) => f.trigger === "random" && f.pool!.length > 2),
    ).toBe(true);
    const a = planFailures(c, 1234);
    const b = planFailures(c, 1234);
    expect(a).toEqual(b);
    a.forEach((it, i) => {
      const f = c.failures[i];
      expect(it.atMin!).toBeGreaterThanOrEqual(f.at);
      expect(it.atMin!).toBeLessThanOrEqual(f.at + f.window!);
      expect(f.pool).toContain(it.key);
      expect(it.drawn).toBe(true);
    });
    expect(a[0].key).not.toBe(a[1].key);
    // different seeds give different draws (times at least)
    const seen = new Set(
      Array.from({ length: 12 }, (_, s) =>
        planFailures(c, s + 1)
          .map((x) => `${x.key}@${x.atMin!.toFixed(2)}`)
          .join(),
      ),
    );
    expect(seen.size).toBeGreaterThan(6);
    // the attempt records its seed; the same seed replays the same failures
    const r1 = new LessonRun(circuitToExercise(c), new Sim());
    const seed = r1.drill!.seed;
    const r2 = new LessonRun(circuitToExercise(c, { seed }), new Sim());
    expect(r2.drill!.plan).toEqual(r1.drill!.plan);
  });

  it("random window fires at the drawn time", () => {
    const c: Circuit = {
      ...newCircuit(),
      drill: { mode: "training", seed: 7 },
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
      failures: [{ key: "vacuum", trigger: "random", at: 0.1, window: 0.4 }],
    };
    expect(validate(c)).toEqual([]);
    const sim = new Sim();
    const r = new LessonRun(circuitToExercise(c), sim);
    const at = r.drill!.plan[0].atMin! * 60;
    const got = hooked(r);
    fly(sim, r, 40, () => got.length > 0);
    expect(got.length).toBe(1);
    expect(Math.abs(r.totalT - at)).toBeLessThan(0.1);
    expect(sim.failures.vacuum).toBe(true);
  });

  it("instructor: never fires on its own, listed as pending, fired on demand", () => {
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
      failures: [
        { key: "electricalFire", trigger: "instructor", at: 0 },
        { key: "gs", trigger: "time", at: 0 },
      ],
    };
    const sim = new Sim();
    const r = new LessonRun(circuitToExercise(c), sim);
    const got = hooked(r);
    fly(sim, r, 10);
    expect(got.map((e) => e.key)).toEqual(["gs"]); // 'now' fires at once
    expect(sim.failures.electricalFire).toBe(false);
    expect(r.instructorFailures().map((p) => p.key)).toEqual([
      "electricalFire",
    ]);
    expect(r.fireInstructorFailure(1)).toBe(false); // not an instructor failure
    expect(r.fireInstructorFailure(0)).toBe(true);
    expect(sim.failures.electricalFire).toBe(true);
    expect(got[1]).toMatchObject({
      key: "electricalFire",
      byInstructor: true,
      trigger: "instructor",
    });
    expect(r.instructorFailures()).toEqual([]);
    expect(r.fireInstructorFailure(0)).toBe(false);
    expect(r.drillLog.length).toBe(2);
  });

  it("trigger texts read in plain words, FR and EN", () => {
    expect(triggerText({ trigger: "altAgl", at: 400 }, "en")).toBe(
      "climbing through 400 ft AGL",
    );
    expect(
      triggerText({ trigger: "altAgl", at: 400, dir: "descent" }, "fr"),
    ).toBe("en descente à 400 ft sol");
    expect(triggerText({ trigger: "random", at: 2, window: 6 }, "en")).toBe(
      "at a random time between 2 and 8 min",
    );
    expect(triggerText({ trigger: "instructor", at: 0 }, "fr")).toMatch(
      /instructeur/,
    );
    expect(triggerText({ trigger: "time", at: 0 }, "en")).toBe("at the start");
  });
});

describe("backward compatibility", () => {
  it("old circuits and share links still decode, validate and fly their failures", () => {
    for (const c of PRESET_CIRCUITS) {
      const back = decodeCircuit(encodeCircuit(c));
      expect(back.failures).toEqual(c.failures);
      expect(back.drill).toBeUndefined();
      expect(validate(back)).toEqual([]);
    }
    // a link made by an older version (base64url JSON, failure keys of the time)
    const old = {
      id: "cold",
      name: "Old link",
      description: "",
      start: {
        type: "air",
        fix: "KEDDY",
        bearing: 20,
        distNm: 10,
        altFt: 4000,
        hdg: null,
        iasKt: 95,
      },
      legs: [
        {
          type: "hold",
          ident: "KEDDY",
          inbound: 270,
          turn: "L",
          legMin: 1,
          alt: 4000,
          laps: 1,
        },
      ],
      weather: {},
      failures: [
        { key: "ahrs", trigger: "time", at: 0.05 },
        { key: "warpDrive", trigger: "time", at: 1 },
      ],
      allowAp: false,
      mode: "checkride",
      cockpit: "steam",
    };
    const link = Buffer.from(JSON.stringify(old))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const c = decodeCircuit(link);
    expect(c.failures).toEqual([{ key: "ahrs", trigger: "time", at: 0.05 }]); // unknown failure dropped
    expect(validate(c)).toEqual([]);
    const sim = new Sim();
    const r = new LessonRun(circuitToExercise(c), sim);
    const got = hooked(r);
    fly(sim, r, 5);
    expect(sim.failures.ahrs).toBe(true);
    // a plain circuit still notifies the runner (checkride → test mode), marked as not a drill
    expect(got[0]).toMatchObject({ key: "ahrs", mode: "test", isDrill: false });
    // saved circuits of an older version come back from the store
    mem.set("ifr.circuits.v1", JSON.stringify([old]));
    expect(circuitStore.list()[0].failures.length).toBe(1);
    mem.delete("ifr.circuits.v1");
  });

  it("legacy leg trigger still fires at its leg", () => {
    const c = PRESET_CIRCUITS.find((x) => x.id === "p-cross")!;
    const r = new LessonRun(circuitToExercise(c), new Sim());
    expect(r.drill!.plan).toEqual([
      {
        index: 0,
        key: "gs",
        trigger: "leg",
        fired: false,
        firedAtS: null,
        expect: undefined,
        hidden: undefined,
      },
    ]);
  });
});

describe("drill templates", () => {
  it("every template builds at a training-region airport, validates, starts in its phase and flies", () => {
    for (const t of DRILL_TEMPLATES) {
      const c = buildDrill(t, { airport: "PARD", lang: "fr" })!;
      expect(c, t.id).toBeTruthy();
      expect(c.drill!.phase).toBe(t.phase);
      expect(c.name.startsWith(t.name.fr)).toBe(true);
      expect(validate(c), t.id).toEqual([]);
      expect(c.world).toBe("training");
      const sim = new Sim();
      const r = new LessonRun(circuitToExercise(c), sim);
      fly(sim, r, 8);
      expect(sim.ac.s.crashed, t.id).toBeNull();
      if (t.phase === "lineup") expect(sim.ac.s.onGround).toBe(true);
      else expect(sim.ac.data.aglFt, t.id).toBeGreaterThan(400);
      // test drills hide everything from the briefing
      if (t.mode === "test")
        expect(c.failures.every((f) => f.hidden)).toBe(true);
    }
  });

  it("every phase builds a valid flight; mode switch hides the failures", () => {
    const c = buildDrill("d-alternator-imc", { airport: "MSVL", lang: "en" })!;
    for (const ph of [
      "lineup",
      "climbout",
      "cruise",
      "approach",
      "hold",
    ] as const) {
      expect(applyPhase(c, ph)).toBe(true);
      expect(validate(c), ph).toEqual([]);
      expect(c.drill!.phase).toBe(ph);
    }
    applyMode(c, "test");
    expect(c.failures.every((f) => f.hidden)).toBe(true);
    applyMode(c, "training");
    expect(c.failures.some((f) => f.hidden)).toBe(false);
  });

  it("the expected procedure is suggested for the phase, club procedures first", () => {
    const efato = buildDrill("d-efato", { airport: "PARD", lang: "en" })!;
    const f = { ...efato.failures[0], expect: undefined };
    expect(suggestProcedure(efato, f, "en")!.id).toBe("c172.efato.en");
    const cruise = buildDrill("d-engine-cruise", {
      airport: "PARD",
      lang: "fr",
    })!;
    expect(
      suggestProcedure(
        cruise,
        { ...cruise.failures[0], expect: undefined },
        "fr",
      )!.id,
    ).toBe("c172.engineFailure.fr");
    expect(procedureChoices("engine", "en").map((p) => p.id)).toContain(
      "c172.forcedLanding.en",
    );
    expect(groupKeys("electrical")).toEqual(
      ["alternator", "battery", "electricalFire"].filter(
        (k) => procedureChoices(k as "alternator").length,
      ),
    );
  });

  it("listDrills: the club drills first, then the templates", () => {
    const c = buildDrill("d-trim", { airport: "PARD", lang: "en" })!;
    c.name = "Trim runaway — F-GXXX";
    c.assignee = "Léa";
    circuitStore.save(c);
    circuitStore.save({ ...newCircuit(), id: "plain" });
    const all = listDrills("en");
    expect(all[0]).toMatchObject({
      kind: "club",
      name: "Trim runaway — F-GXXX",
      assignee: "Léa",
      failures: ["trimRunaway"],
    });
    expect(all.filter((d) => d.kind === "template").length).toBe(
      DRILL_TEMPLATES.length,
    );
    expect(all.some((d) => d.id === "plain")).toBe(false);
    expect(all.find((d) => d.id === "d-club-test")!.failures).toEqual([
      "random",
      "random",
    ]);
    expect(all[0].build()!.drill!.mode).toBe("training");
    expect(all.find((d) => d.id === "d-efato")!.build("PARD")!.start.type).toBe(
      "runway",
    );
    mem.delete("ifr.circuits.v1");
  });

  it("templates build at a real-world airport (LFPN) once its region is loaded", async () => {
    const { loadRegion, leaveRealWorld } = await import("../src/nav/world");
    await loadRegion(["LFPN"]);
    try {
      for (const t of DRILL_TEMPLATES) {
        const c = buildDrill(t, { airport: "LFPN", lang: "fr" })!;
        expect(c, t.id).toBeTruthy();
        expect(c.world).toBe("real");
        expect(c.dep).toBe("LFPN");
        expect(validate(c, "fr"), t.id).toEqual([]);
      }
      const sim = new Sim();
      const c = buildDrill("d-efato", { airport: "LFPN", phase: "climbout" })!;
      const r = new LessonRun(circuitToExercise(c), sim);
      fly(sim, r, 5);
      expect(sim.ac.s.crashed).toBeNull();
      expect(sim.ac.data.aglFt).toBeGreaterThan(450);
    } finally {
      leaveRealWorld();
    }
  }, 60000);
});

describe("validation", () => {
  const base = (): Circuit => ({
    ...newCircuit(),
    legs: [{ type: "fix", ident: "ARD", alt: 3000 }],
  });
  it("catches bad triggers, in English and in French", () => {
    const c = base();
    c.failures = [
      { key: "engine", trigger: "altAgl", at: 20 },
      { key: "vacuum", trigger: "random", at: 230, window: 30 },
      { key: "gs", trigger: "leg", at: 4 },
      { key: "comms", trigger: "fix", at: 0, fix: "NOWHERE" },
      { key: "alternator", trigger: "random", at: 1, window: 3, pool: [] },
    ];
    const en = validate(c);
    expect(en).toContain(
      "Failure Engine failure: the height must be 50 to 15000 ft above the ground.",
    );
    expect(
      en.some((e) => /random window must be within 0–240 min/.test(e)),
    ).toBe(true);
    expect(en.some((e) => /leg 4 does not exist/.test(e))).toBe(true);
    expect(en.some((e) => /unknown fix “NOWHERE”/.test(e))).toBe(true);
    expect(en.some((e) => /random group is empty/.test(e))).toBe(true);
    expect(
      validate({ ...base(), failures: [{ key: "engine", trigger: "time", at: 2, expect: "club.deleted-proc" }] }).join(" "),
    ).toMatch(/expected procedure no longer exists/);
    expect(validate({ ...base(), failures: [{ key: "engine", trigger: "time", at: 2, expect: "c172.efato" }] })).toEqual([]);
    const fr = validate(c, "fr");
    expect(fr).toContain(
      "Panne Panne moteur : la hauteur doit être comprise entre 50 et 15000 ft sol.",
    );
    expect(fr.some((e) => /l’étape 4 n’existe pas/.test(e))).toBe(true);
    expect(fr.length).toBe(en.length);
  });

  it("a climb-out start needs a trigger above its start height; a take-off drill needs no leg", () => {
    const c = buildDrill("d-efato", { airport: "PARD", phase: "climbout" })!;
    c.failures[0] = { key: "engine", trigger: "altAgl", at: 300, dir: "climb" };
    expect(validate(c).join(" ")).toMatch(/starts at 500 ft/);
    c.failures[0].dir = "descent";
    expect(validate(c)).toEqual([]);
    c.legs = [];
    expect(validate(c)).toEqual([]);
    expect(validate({ ...c, drill: undefined }).join(" ")).toMatch(
      /at least one leg/,
    );
  });
});

describe("failure markers on the map and profile", () => {
  it("places time, height, fix and random-window triggers along the planned track", () => {
    const c = buildDrill("d-alternator-imc", { airport: "PARD", lang: "en" })!;
    c.failures = [
      { key: "alternator", trigger: "time", at: 2 },
      { key: "engine", trigger: "altAgl", at: 1000, dir: "descent" },
      {
        key: "comms",
        trigger: "fix",
        at: 0,
        fix: c.legs[0].type === "fix" ? c.legs[0].ident : "ARD",
      },
      { key: "vacuum", trigger: "random", at: 1, window: 4 },
      { key: "flaps", trigger: "instructor", at: 0 },
    ];
    const m = failureMarks(c);
    expect(m.length).toBe(5);
    expect(m[0].d0).toBeCloseTo((2 * 105) / 60, 0);
    expect(m[1].d0).toBeGreaterThan(m[2].d0); // descending through 1000 ft AGL is on final, after the IAF
    expect(m[2].p).toBeTruthy();
    expect(m[3].d1! - m[3].d0).toBeGreaterThan(5);
    expect(m[4].d0).toBeNaN(); // instructor: no place on the track
    expect(planGeometry(c).points.length).toBeGreaterThan(2);
  });
});

describe("review fixes", () => {
  it("an EFATO moved to an airborne phase gets a trigger that can happen, and still fires", () => {
    const c = buildDrill("d-efato", { airport: "PARD", lang: "en" })!;
    expect(c.failures[0]).toMatchObject({ trigger: "altAgl", at: 400, dir: "climb" });
    applyPhase(c, "cruise");
    expect(c.failures[0].trigger).not.toBe("altAgl");
    expect(validate(c)).toEqual([]);
    const sim = new Sim();
    const r = new LessonRun(circuitToExercise(c), sim);
    const got = hooked(r);
    fly(sim, r, 200, () => got.length > 0);
    expect(got.map((e) => e.key)).toEqual(["engine"]);
  });

  it("an EFATO moved to the cruise expects the in-flight procedure and is renamed; a custom name is kept", () => {
    const c = buildDrill("d-efato", { airport: "PARD", lang: "en" })!;
    expect(c.name).toBe("Engine failure after take-off (EFATO) · PARD");
    expect(c.failures[0].expect).toBe("c172.efato");
    applyPhase(c, "cruise");
    expect(c.failures[0].expect).toBeUndefined();
    expect(suggestProcedure(c, c.failures[0], "en")?.id).not.toMatch(/efato/i);
    expect(c.name).toBe("Engine failure · Cruise · PARD");
    // back to the take-off: the template's name again
    applyPhase(c, "lineup");
    expect(c.name).toBe("Engine failure after take-off (EFATO) · PARD");
    c.name = "Léa — EFATO piste 27";
    applyPhase(c, "cruise");
    expect(c.name).toBe("Léa — EFATO piste 27");
    // built straight in another phase
    const d = buildDrill("d-efato", { airport: "PARD", phase: "cruise", lang: "fr" })!;
    expect(d.failures[0].expect).toBeUndefined();
    expect(d.name).toBe("Panne moteur · Croisière · PARD");
    // an EFATO kept on the climb-out still expects the EFATO
    const e = buildDrill("d-efato", { airport: "PARD", phase: "climbout", lang: "en" })!;
    expect(e.failures[0].expect).toBe("c172.efato");
  });

  it("a height trigger an airborne start never climbs through is refused, in plain words", () => {
    const c = buildDrill("d-alternator-imc", { airport: "PARD", lang: "en" })!;
    c.failures = [{ key: "alternator", trigger: "altAgl", at: 1000, dir: "climb" }];
    expect(validate(c).join(" ")).toMatch(/never climbs through 1000 ft: choose “descending”/);
    expect(validate(c, "fr").join(" ")).toMatch(/choisissez « en descente »/);
    c.failures[0].dir = "descent";
    expect(validate(c)).toEqual([]);
  });

  it("cruise levels follow the semicircular rule: VFR thousands + 500, IFR whole thousands", () => {
    expect(cruiseAlt(0, 270, false)).toBe(4500); // westbound VFR: even + 500
    expect(cruiseAlt(0, 90, false)).toBe(5500); // eastbound VFR: odd + 500
    expect(cruiseAlt(0, 270, true)).toBe(4000); // westbound IFR: even
    expect(cruiseAlt(0, 90, true)).toBe(5000); // eastbound IFR: odd
    expect(cruiseAlt(2000, 90, true)).toBe(5000);
    expect(cruiseAlt(2600, 90, true)).toBe(7000);
    const c = buildDrill("d-alternator-imc", { airport: "PARD", lang: "en" })!;
    expect(c.start.type).toBe("air");
    const course = c.start.type === "air" ? (c.start.bearing + 180) % 360 : 0;
    const ifrAlt = c.start.type === "air" ? c.start.altFt : 0;
    expect(ifrAlt % 1000).toBe(0);
    expect(Math.floor(ifrAlt / 1000) % 2 === 1).toBe(course < 180);
    applyWx(c, "vmc");
    const vfrAlt = c.start.type === "air" ? c.start.altFt : 0;
    expect(vfrAlt % 1000).toBe(500);
    expect(c.legs[0].type === "fix" && c.legs[0].alt).toBe(vfrAlt);
    expect(validate(c)).toEqual([]);
  });

  it("an EFATO pin sits ahead of the runway, on the runway heading", () => {
    const c = buildDrill("d-efato", { airport: "PARD", lang: "en" })!;
    const st = c.start as Extract<Circuit["start"], { type: "runway" }>;
    const rw = runway(st.airport, st.runway);
    const m = failureMarks(c)[0];
    expect(m.p).toBeTruthy();
    const d = distanceNm(rw.threshold, m.p!);
    expect(d).toBeGreaterThan(0.6);
    expect(d).toBeLessThan(1.3);
    const off = Math.abs(((bearingDeg(rw.threshold, m.p!) - rw.heading + 540) % 360) - 180);
    expect(off).toBeLessThan(3);
  });

  it("the briefing names each failure and when, without “X failure fails”", () => {
    const c = buildDrill("d-efato", { airport: "PARD", lang: "en" })!;
    const en = circuitToExercise(c).briefing.join(" ");
    expect(en).toMatch(/Engine failure: climbing through 400 ft AGL\./);
    expect(en).not.toMatch(/failure fails/);
  });

  it("a timed engine failure 1 min after lining up is still an EFATO; 2 min is in flight", () => {
    const c = buildDrill("d-efato", { airport: "PARD", lang: "en" })!;
    const at1 = suggestProcedure(c, { key: "engine", trigger: "time", at: 1 }, "en");
    const at2 = suggestProcedure(c, { key: "engine", trigger: "time", at: 2.5 }, "en");
    const roll = suggestProcedure(c, { key: "engine", trigger: "time", at: 0.2 }, "en");
    expect(at1!.id).toBe("c172.efato.en");
    expect(at2!.id).not.toBe("c172.efato.en");
    expect(roll!.when?.onGround).toBe(true);
  });

  it("each fired failure carries the attempt's seed (the debrief can replay the draw)", () => {
    const c = buildDrill("d-club-test", { airport: "PARD", lang: "en" })!;
    c.failures = [{ ...c.failures[0], at: 0, window: 0.1 }];
    const sim = new Sim();
    const r = new LessonRun(circuitToExercise(c, { seed: 99 }), sim);
    const got = hooked(r);
    fly(sim, r, 10, () => got.length > 0);
    expect(got[0]).toMatchObject({ seed: 99, drawn: true, mode: "test" });
    expect(c.failures[0].pool).toContain(got[0].key);
  });

  it("a French student reads the drill briefing in French", () => {
    const c = buildDrill("d-efato", { airport: "PARD", phase: "climbout", lang: "fr" })!;
    c.failures[0].at = 700;
    setLang("fr");
    try {
      const ex = circuitToExercise(c);
      const b = ex.briefing.join(" ");
      expect(b).toMatch(/En montée après le décollage de PARD piste 27, 500 ft sol/);
      expect(b).toMatch(/étape/);
      expect(b).not.toMatch(/Airborne|legs/);
    } finally {
      setLang("en");
    }
  });

  it("the standards list only what the flight has, in the student's language", () => {
    const c = buildDrill("d-efato", { airport: "PARD", lang: "en" })!;
    const en = circuitToExercise(c).standards.join(" | ");
    expect(en).toMatch(/Emergency procedures/);
    expect(en).not.toMatch(/Holds|SID \/ STAR/);
    setLang("fr");
    try {
      const h = buildDrill("d-vacuum-app", { airport: "PARD", phase: "hold", lang: "fr" })!;
      const fr = circuitToExercise(h).standards.join(" | ");
      expect(fr).toMatch(/Attentes : entrée correcte/);
      expect(fr).toMatch(/Procédures d’urgence/);
      expect(fr).not.toMatch(/Holds|Approaches to/);
    } finally {
      setLang("en");
    }
  });

  it("the approach phase is not called 'IMC approach' (the weather is chosen apart: a flaps drill is VMC)", async () => {
    const { PHASES } = await import("../src/train/drills");
    const ap = PHASES.find((p) => p.id === "approach")!;
    expect(ap.name.en).toBe("Approach");
    expect(ap.name.fr).toBe("Approche");
    expect(DRILL_TEMPLATES.find((t) => t.id === "d-flaps")!.wx).toBe("vmc");
  });

  it("a height above the highest planned altitude is refused (it would never fire)", () => {
    const c = buildDrill("d-efato", { airport: "PARD", lang: "en" })!;
    expect(validate(c)).toEqual([]);
    c.failures[0].at = 9000;
    const e = validate(c).join(" ");
    expect(e).toMatch(/never climbs that high/);
    expect(validate(c, "fr").join(" ")).toMatch(/ne monte jamais aussi haut/);
  });
});
