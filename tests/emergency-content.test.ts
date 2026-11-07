// Emergency content vs the C172S POH (audit track B part 1): the G1000 and the classic panel get their own
// checklists (C172S NAV III POH vs the steam-gauge C172S POH), lost comms follows the airspace (14 CFR 91.185 vs
// SERA.14083) and never the UI language, the restart drill can be cured, no invented annunciator is relied upon,
// and the procedures named by the audit exist.
import { beforeEach, describe, expect, it } from "vitest";
import {
  LIBRARY,
  LIBRARY_BASES,
  libraryProcedure,
} from "../src/train/procedureLibrary";
import {
  DrillSession,
  airspaceRegion,
  fakeView,
  pickProcedure,
  procedureForCockpit,
  simView,
  type ProcSimView,
} from "../src/train/procedures";
import { CHECKS } from "../src/train/procedureChecks";
import {
  clearClubLibrary,
  effectiveProcedures,
} from "../src/train/procedureStore";
import { DRILL_TEMPLATES, phaseView, buildDrill } from "../src/train/drills";
import type { Procedure } from "../src/train/procedureTypes";
import { SCENARIOS, Sim } from "../src/sim/sim";
import {
  ANNUNCIATOR_LEVEL,
  FAILURE_LABELS_EN,
  type FailureKey,
} from "../src/sim/systemsTypes";

const v = (o: Partial<ProcSimView> = {}) => fakeView(o);
const lib = (id: string) => libraryProcedure(id)!;
const ctx = { failedAtS: 0, elapsedS: 1 };
const g1000 = v({ cockpit: "g1000" });
const steam = v({ cockpit: "steam" });
const isSw = (p: Procedure, key: string, value: unknown) =>
  p.items.some(
    (it) =>
      it.check?.id === "switch" &&
      it.check.p?.key === key &&
      it.check.p?.value === value,
  );

beforeEach(() => clearClubLibrary());

describe("G1000 vs classic panel (C172S NAV III POH vs C172S POH)", () => {
  it("LOW VOLTS on the G1000 never switches the BAT master OFF: MASTER ALT only, then ALT and BAT ON", () => {
    for (const lang of ["en", "fr"] as const) {
      const p = pickProcedure(
        effectiveProcedures(),
        "alternator",
        lang,
        "c172.alternator",
        g1000,
      )!;
      expect(p.id).toBe(`c172.alternator.${lang}`);
      expect(isSw(p, "batMaster", false)).toBe(false);
      // NAV III order: AVIONICS BUS 1 OFF only in the "LOW VOLTS remains" branch, after ALT OFF again — never in
      // the reset (the steam POH's "avionics OFF first" is not the G1000 flow)
      const ix = (id: string) => p.items.findIndex((x) => x.id === id);
      expect(ix("shedBus1")).toBeGreaterThan(ix("altOff2"));
      expect(ix("altOff2")).toBeGreaterThan(ix("masterOn"));
      expect(p.items[ix("shedBus1")].check).toEqual({ id: "switch", p: { key: "avionics", value: false } });
      expect(p.items[ix("altOff2")].check).toEqual({ id: "switch", p: { key: "altMaster", value: false } });
      expect(ix("shedBus2")).toBeGreaterThan(ix("shedBus1"));
      expect(p.items[0].check).toEqual({
        id: "switch",
        p: { key: "altMaster", value: false },
      });
      expect(p.items.some((it) => /LOW VOLTS/.test(it.text))).toBe(true);
      // the endurance message tells the truth: shed ≈ 40 min of main battery, then ≥ 30 min of standby battery
      expect(p.summary).not.toMatch(
        /about 30 minutes of battery|environ 30 minutes de batterie/,
      );
      expect(p.summary).toMatch(/30 min/);
    }
    // the classic panel follows the 1998 POH: avionics OFF, both master halves OFF then ON
    const s = pickProcedure(
      effectiveProcedures(),
      "alternator",
      "en",
      "c172.alternator",
      steam,
    )!;
    expect(s.id).toBe("c172.alternatorSteam.en");
    expect(isSw(s, "avionics", false)).toBe(true);
    expect(isSw(s, "batMaster", false)).toBe(true);
    // without an expectation the failure alone picks by cockpit too
    expect(
      pickProcedure(
        effectiveProcedures(),
        "alternator",
        "fr",
        undefined,
        steam,
      )!.id,
    ).toBe("c172.alternatorSteam.fr");
    expect(
      pickProcedure(
        effectiveProcedures(),
        "alternator",
        "fr",
        undefined,
        g1000,
      )!.id,
    ).toBe("c172.alternator.fr");
  });

  it("the G1000 LOW VOLTS flow is gradable: ALT OFF, ALT ON (BAT stays ON), ALT OFF again, bus 1, lights, bus 2", () => {
    const s = new DrillSession({ mode: "training", lang: "en" });
    const r = s.start("alternator", 0, "c172.alternator", v({ t: 0 }))!;
    let cur = v({ t: 0 });
    let altOff2At: number | null | undefined;
    for (let t = 0; t <= 60; t += 0.5) {
      const sw = {
        ...cur.sw,
        altMaster: !(t >= 3 && t < 8) && t < 12,
        avionics: t < 15,
        landingLight: false,
        beacon: t < 20,
        avionics2: t < 22,
      };
      cur = { ...cur, t, sw };
      s.update(cur);
      // the first ALT OFF answers the first item only: one flick of the switch never ticks two steps
      if (t === 5) altOff2At = r.state().items.find((x) => x.id === "altOff2")!.done ? t : null;
    }
    expect(altOff2At).toBeNull();
    for (const id of ["altCb", "lowVolts", "meters", "shed12v", "land"])
      r.confirm(id, "student");
    const res = r.result();
    const it = (id: string) => res.items.find((x) => x.id === id)!;
    expect(it("altOff").done && it("masterOn").done).toBe(true);
    expect(it("masterOn").atS).toBeGreaterThanOrEqual(8);
    expect(it("altOff2").done).toBe(true);
    expect(it("altOff2").by).toBe("auto");
    expect(it("altOff2").atS).toBeGreaterThanOrEqual(12);
    expect(it("shedBus1").done && it("shedBeacon").done && it("shedBus2").done).toBe(true);
    expect(res.verdict).toBe("PASS");
  });

  it("every G1000 master-OFF checklist (fires, forced landing, take-off roll) turns STBY BATT OFF first; the classic panel drops it", () => {
    for (const base of [
      "c172.takeoffRoll",
      "c172.efato",
      "c172.forcedLanding",
      "c172.electricalFire",
      "c172.cabinFire",
      "c172.precautionary",
      "c172.fireStart",
    ]) {
      const p = lib(`${base}.en`);
      const ids = p.items.map((x) => x.id);
      const stby = ids.indexOf("stbyBatt");
      const master = p.items.findIndex(
        (x) =>
          x.check?.id === "switch" &&
          x.check.p?.key === "batMaster" &&
          x.check.p?.value === false,
      );
      expect(stby, base).toBeGreaterThanOrEqual(0);
      expect(stby, base).toBeLessThan(master);
      expect(p.items[stby].cockpit).toEqual(["g1000", "airliner"]);
      expect(
        procedureForCockpit(p, "steam").items.some((x) => x.id === "stbyBatt"),
        base,
      ).toBe(false);
      expect(
        procedureForCockpit(p, "g1000").items.some((x) => x.id === "stbyBatt"),
        base,
      ).toBe(true);
    }
  });

  it("the drill session runs only the items of the cockpit flown", () => {
    const s = new DrillSession({ mode: "training", lang: "en" });
    const r = s.start(
      "electricalFire",
      0,
      undefined,
      v({ t: 0, cockpit: "steam" }),
    )!;
    expect(r.procedure.items.some((x) => x.id === "stbyBatt")).toBe(false);
    const g = new DrillSession({ mode: "training", lang: "en" });
    const rg = g.start(
      "electricalFire",
      0,
      undefined,
      v({ t: 0, cockpit: "g1000" }),
    )!;
    expect(rg.procedure.items.some((x) => x.id === "stbyBatt")).toBe(true);
  });

  it("vacuum on the G1000 only loses the standby attitude: no partial panel; AHRS failure flies the standby attitude, never the turn coordinator", () => {
    const vg = pickProcedure(
      effectiveProcedures(),
      "vacuum",
      "en",
      "c172.vacuum",
      g1000,
    )!;
    expect(vg.id).toBe("c172.vacuumG1000.en");
    expect(vg.items.some((it) => /cover/i.test(it.text))).toBe(false);
    expect(vg.items.some((it) => /standby attitude/i.test(it.text))).toBe(true);
    const vs = pickProcedure(
      effectiveProcedures(),
      "vacuum",
      "en",
      "c172.vacuum",
      steam,
    )!;
    expect(vs.id).toBe("c172.vacuum.en");
    expect(vs.items[0].id).toBe("suction"); // POH item 1: suction gauge — check
    const ah = pickProcedure(
      effectiveProcedures(),
      "ahrs",
      "fr",
      undefined,
      g1000,
    )!;
    expect(ah.id).toBe("c172.ahrs.fr");
    expect(ah.items.some((it) => /indicateur de virage/i.test(it.text))).toBe(
      false,
    );
    expect(ah.items[0].text).toMatch(/Horizon de secours/);
    // the classic panel has no AHRS: an attitude failure is partial panel
    expect(
      pickProcedure(effectiveProcedures(), "ahrs", "en", undefined, steam)!.id,
    ).toBe("c172.vacuum.en");
  });

  it("G1000 air data failure: standby airspeed and altimeter first; pitot heat / alternate static only if they read wrong too", () => {
    const p = lib("c172.airData.en");
    const ids = p.items.map((x) => x.id);
    expect(ids.indexOf("standby")).toBeLessThan(ids.indexOf("heat"));
    expect(p.items.find((x) => x.id === "heat")!.optional).toBe(true);
    expect(p.items.find((x) => x.id === "alt")!.optional).toBe(true);
    expect(
      procedureForCockpit(p, "steam").items.some((x) => x.id === "standby"),
    ).toBe(false);
  });
});

describe("electrical fire: the POH restore branch", () => {
  it("fire out and power needed: master ON, STBY BATT ARM, avionics bus 1, bus 2 one at a time; land as soon as possible", () => {
    for (const lang of ["en", "fr"] as const) {
      const p = lib(`c172.electricalFire.${lang}`);
      const ids = p.items.map((x) => x.id);
      for (const id of [
        "restoreMaster",
        "restoreStby",
        "restoreBus1",
        "restoreBus2",
        "restoreOne",
      ])
        expect(ids.indexOf(id), id).toBeGreaterThan(ids.indexOf("breakers"));
      expect(ids[ids.length - 1]).toBe("land");
      expect(p.items.find((x) => x.id === "extinguisher")!.text).toMatch(
        /ventilate|aérer/,
      );
    }
    // the restore items are credited when the pilot turns the power back on after the fire is out
    const s = new DrillSession({ mode: "training", lang: "en" });
    const r = s.start("electricalFire", 0, undefined, v({ t: 0 }))!;
    let cur = v({ t: 0 });
    for (let t = 0; t <= 90; t += 0.5) {
      const off = t >= 2 && t < 40;
      const sw = {
        ...cur.sw,
        stbyBatt: !(t >= 1 && t < 45),
        batMaster: !off,
        altMaster: !off,
        avionics: !(t >= 4 && t < 50),
        avionics2: t < 5,
      };
      cur = { ...cur, t, sw };
      s.update(cur);
    }
    const res = r.result();
    const it = (id: string) => res.items.find((x) => x.id === id)!;
    expect(it("restoreMaster").done).toBe(true);
    expect(it("restoreMaster").atS).toBeGreaterThanOrEqual(40);
    expect(it("restoreStby").done && it("restoreBus1").done).toBe(true);
  });
});

describe("lost comms follow the airspace, not the language", () => {
  it("airspace of an ident: US (K…, P…, FAA identifiers) → 14 CFR, everything else → ICAO / SERA", () => {
    expect(airspaceRegion("KBOS")).toBe("faa");
    expect(airspaceRegion("PHNL")).toBe("faa");
    expect(airspaceRegion("PANC")).toBe("faa");
    expect(airspaceRegion("1B1")).toBe("faa");
    expect(airspaceRegion("LFPG")).toBe("icao");
    expect(airspaceRegion("EGLL")).toBe("icao");
    expect(airspaceRegion("LFPN")).toBe("icao");
    expect(airspaceRegion(undefined)).toBe("faa");
  });

  it("a French-speaking pilot in the US gets 91.185; an English-speaking pilot in France gets SERA.14083", () => {
    const list = effectiveProcedures();
    const usFr = pickProcedure(
      list,
      "comms",
      "fr",
      "c172.lostComms",
      v({ region: "faa" }),
    )!;
    expect(usFr.id).toBe("c172.lostComms.fr");
    expect(usFr.ref).toMatch(/91\.185/);
    const frEn = pickProcedure(
      list,
      "comms",
      "en",
      "c172.lostComms",
      v({ region: "icao" }),
    )!;
    expect(frEn.id).toBe("c172.lostCommsSera.en");
    expect(frEn.ref).toMatch(/SERA\.14083/);
    expect(
      pickProcedure(list, "comms", "en", undefined, v({ region: "icao" }))!.id,
    ).toBe("c172.lostCommsSera.en");
    expect(
      pickProcedure(list, "comms", "fr", undefined, v({ region: "faa" }))!.id,
    ).toBe("c172.lostComms.fr");
  });

  it("VMC is the first, mandatory decision; 7600 has no time limit; 91.185(c)(3) and the SERA 'then the filed plan' are there", () => {
    for (const base of ["c172.lostComms", "c172.lostCommsSera"])
      for (const lang of ["en", "fr"] as const) {
        const p = lib(`${base}.${lang}`);
        expect(p.items[0].id).toBe("vmc");
        expect(p.items[0].optional).toBeFalsy();
        expect(p.items.find((x) => x.id === "squawk")!.withinS).toBeUndefined();
      }
    const faa = lib("c172.lostComms.en").items.find(
      (x) => x.id === "limit",
    )!.text;
    expect(faa).toMatch(/approach fix/);
    expect(faa).toMatch(/EFC/);
    expect(faa).not.toMatch(
      /^Clearance limit — leave it at the EFC time \(or the ETA\)/,
    );
    expect(
      lib("c172.lostCommsSera.en").items.some((x) => x.id === "filed"),
    ).toBe(true);
    expect(
      lib("c172.lostCommsSera.fr").items.find((x) => x.id === "timer")!.note,
    ).toMatch(/plus tardif/);
  });

  it("the drill builder resolves the variant of the drill's airport and cockpit", () => {
    const tpl = DRILL_TEMPLATES.find((t) => t.id === "d-lostcomms")!;
    const c = buildDrill(tpl, { lang: "en" });
    expect(c).not.toBeNull();
    if (!c) return;
    const view = phaseView(c, c.failures[0]);
    expect(view.region).toBe(airspaceRegion(c.dep));
    expect(view.cockpit).toBe(c.cockpit ?? "g1000");
  });
});

describe("drills: a restart that can work, the procedures they expect", () => {
  it("the cruise engine drill starts from fuel starvation (curable by the POH flow); a separate drill keeps the mechanical failure", () => {
    const cruise = DRILL_TEMPLATES.find((t) => t.id === "d-engine-cruise")!;
    expect(cruise.failures[0].key).toBe("fuelStarvation");
    expect(cruise.failures[0].expect).toBe("c172.engineFailure");
    expect(
      DRILL_TEMPLATES.find((t) => t.id === "d-forced-landing")!.failures[0].key,
    ).toBe("engine");
    expect(
      DRILL_TEMPLATES.find((t) => t.id === "d-pitot-icing")!.failures[0].expect,
    ).toBe("c172.icing");
    // fuel starvation picks the restart flow; at low height the EFATO
    const list = effectiveProcedures();
    expect(
      pickProcedure(
        list,
        "fuelStarvation",
        "en",
        undefined,
        v({ aglFt: 4000 }),
      )!.id,
    ).toBe("c172.engineFailure.en");
    expect(
      pickProcedure(list, "fuelStarvation", "en", undefined, v({ aglFt: 400 }))!
        .id,
    ).toBe("c172.efato.en");
  });

  it("a restart that works is no forced landing; one that does not is", () => {
    const s = new DrillSession({ mode: "training", lang: "en" });
    s.start("fuelStarvation", 0, "c172.engineFailure", v({ t: 0 }));
    let cur = v({ t: 0, sw: { ...v().sw, fuelSelector: "LEFT" } });
    for (let t = 0; t <= 150; t += 0.5) {
      // the engine quits at 8 s; selector BOTH and pump ON at 12 s; it fires again at 16 s
      cur = {
        ...cur,
        t,
        iasKt: 68,
        engineRunning: t < 8 || t >= 16,
        sw: {
          ...cur.sw,
          fuelSelector: t >= 12 ? "BOTH" : "LEFT",
          auxPump: t >= 12,
        },
      };
      s.update(cur);
    }
    expect(s.runners.length).toBe(1);
    const sel = s.results()[0].items.find((x) => x.id === "selector")!;
    expect(sel.done).toBe(true);
    expect(sel.by).toBe("auto"); // a real action, not a pre-set position credited for free
  });

  it("the restart flow ends with the engine running in the real systems (fuel starvation drill, G1000)", () => {
    const sim = new Sim();
    sim.load(SCENARIOS.find((x) => x.id === "free")!);
    // the drill set-up: selector left on a nearly empty tank (never moved by the injection)
    sim.systems.prepareStarvation(sim, 60);
    sim.setFailure("fuelStarvation", true);
    const dt = 0.1;
    let t = 0;
    while (sim.sys.engineRunning && t < 30) (sim.step(dt), (t += dt));
    expect(sim.sys.engineRunning).toBe(false);
    for (const [k, val] of [
      ["fuelShutoff", true],
      ["fuelSelector", "BOTH"],
      ["auxPump", true],
      ["mixture", 1],
      ["magnetos", "BOTH"],
    ] as const)
      sim.setSwitch(k, val as never);
    for (let i = 0; i < 200 && !sim.sys.engineRunning; i++) sim.step(dt);
    expect(sim.sys.engineRunning).toBe(true);
    expect(simView(sim).cockpit).toBe("g1000");
  });
});

describe("content fixes named by the audit", () => {
  it("the missing POH procedures exist in both languages", () => {
    for (const b of [
      "c172.fireStart",
      "c172.cabinFire",
      "c172.wingFire",
      "c172.precautionary",
      "c172.ditching",
      "c172.icing",
      "c172.highVolts",
      "c172.lowVoltsIdle",
      "c172.stbyBatt",
      "c172.carbonMonoxide",
      "c172.display",
      "c172.ahrs",
      "c172.battery",
      "c172.spin",
      "c172.lostCommsVfr",
    ]) {
      expect(LIBRARY_BASES, b).toContain(b);
      expect(libraryProcedure(b, "fr"), b).not.toBeNull();
    }
    // fire during start answers an engine fire on the ground, the in-flight one in the air
    const list = effectiveProcedures();
    expect(
      pickProcedure(
        list,
        "engineFire",
        "en",
        undefined,
        v({ onGround: true, aglFt: 0 }),
      )!.id,
    ).toBe("c172.fireStart.en");
    expect(pickProcedure(list, "engineFire", "en", undefined, v())!.id).toBe(
      "c172.engineFire.en",
    );
  });

  it("engine fire: 100 KIAS is a memory item, the forced landing follows as its own procedure", () => {
    const p = lib("c172.engineFire.en");
    expect(p.items.find((x) => x.id === "ias")!.memory).toBe(true);
    expect(p.items.some((x) => x.id === "forced")).toBe(false);
    expect(p.then).toEqual({ procedure: "c172.forcedLanding" });
    const s = new DrillSession({ mode: "training", lang: "en" });
    const fire = s.start("engineFire", 0, undefined, v({ t: 0 }))!;
    // NAV III POH: no STBY BATT step in an engine fire (the PFD and COM1 stay for the MAYDAY); cabin vents OPEN
    expect(fire.procedure.items.some((x) => x.id === "stbyBatt")).toBe(false);
    expect(fire.procedure.items.find((x) => x.id === "vents")!.text).toMatch(/OPEN/);
    let cur = v({ t: 0 });
    for (let t = 0; t <= 40; t += 0.5) {
      if (t === 6) fire.confirm("vents", "student");
      cur = {
        ...cur,
        t,
        iasKt: 100,
        sw: {
          ...cur.sw,
          mixture: 0,
          fuelShutoff: t < 2,
          stbyBatt: t < 3,
          batMaster: t < 4,
          altMaster: t < 4,
        },
      };
      s.update(cur);
    }
    expect(s.runners.map((r) => r.procedure.id)).toEqual([
      "c172.engineFire.en",
      "c172.forcedLanding.en",
    ]);
  });

  it("pitot icing runs the inadvertent-icing procedure: pitot heat and leaving the icing are both memory items", () => {
    const list = effectiveProcedures();
    const p = pickProcedure(list, "pitotIcing", "en", undefined, v())!;
    expect(p.id).toBe("c172.icing.en");
    const exit = p.items.find((x) => x.id === "exit")!;
    expect(exit.memory).toBe(true);
    expect(exit.optional).toBeFalsy();
    expect(pickProcedure(list, "pitotBlocked", "en", undefined, v())!.id).toBe(
      "c172.pitot.en",
    );
  });

  it("rough engine / partial power: BOTH is right without a faulty magneto; the fuel pump is conditional", () => {
    const sys = (badMag: "L" | "R" | null) =>
      ({ badMag }) as unknown as ProcSimView["sys"];
    const good = (m: "L" | "R" | null, mags: "L" | "R" | "BOTH") =>
      CHECKS.switch.evaluate(
        v({ sys: sys(m), sw: { ...v().sw, magnetos: mags } }),
        { key: "magnetos", value: "GOOD" },
        ctx,
      );
    expect(good(null, "BOTH")).toBe(true);
    expect(good(null, "L")).toBe(false);
    expect(good("R", "L")).toBe(true);
    expect(
      lib("c172.roughEngine.en").items.find((x) => x.id === "auxPump")!
        .optional,
    ).toBe(true);
  });

  it("GS failure: the LOC MDA decision comes first (go around below it); fuel leak: only the leaking (left) tank answers", () => {
    const gs = lib("c172.gsFail.en");
    expect(gs.items[0]).toMatchObject({ id: "below", memory: true });
    expect(gs.items[0].text).toMatch(/GO AROUND/);
    const leak = lib("c172.fuelLeak.en").items.find(
      (x) => x.id === "selector",
    )!;
    expect(leak.check).toEqual({
      id: "switch",
      p: { key: "fuelSelector", value: "LEFT" },
    });
  });

  it("no checklist relies on an annunciator a C172S does not have; the annunciator check reads the real ones", () => {
    const fake = /\b(FIRE|SMOKE|DOOR) (light|annunciator)|FUEL PRESS\b/;
    for (const p of LIBRARY)
      for (const it of p.items) {
        expect(fake.test(it.text), `${p.id}/${it.id}`).toBe(false);
        if (it.note)
          expect(/FUEL PRESS/.test(it.note), `${p.id}/${it.id}`).toBe(false);
        if (it.check?.id === "annunciator")
          expect(Object.keys(ANNUNCIATOR_LEVEL)).toContain(
            String(it.check.p?.name),
          );
      }
    const lit = {
      annunciators: ["LOW VOLTS"],
      essPowered: true,
    } as unknown as ProcSimView["sys"];
    const dark = {
      annunciators: [],
      essPowered: true,
    } as unknown as ProcSimView["sys"];
    const dead = {
      annunciators: [],
      essPowered: false,
      powered: false,
    } as unknown as ProcSimView["sys"];
    expect(
      CHECKS.annunciator.evaluate(
        v({ sys: lit }),
        { name: "LOW VOLTS", lit: false },
        ctx,
      ),
    ).toBe(false);
    expect(
      CHECKS.annunciator.evaluate(
        v({ sys: dark }),
        { name: "LOW VOLTS", lit: false },
        ctx,
      ),
    ).toBe(true);
    // a dark panel is not "the light went out"
    expect(
      CHECKS.annunciator.evaluate(
        v({ sys: dead }),
        { name: "LOW VOLTS", lit: false },
        ctx,
      ),
    ).toBe(false);
    expect(
      CHECKS.brake.evaluate(
        v({ controls: { ...v().controls, brake: 1 } }),
        { min: 0.8 },
        ctx,
      ),
    ).toBe(true);
    expect(CHECKS.brake.evaluate(v(), { min: 0.8 }, ctx)).toBe(false);
  });

  it("every failure has a procedure, and every procedure exists in both languages with the same items", () => {
    const covered = new Set(LIBRARY.flatMap((p) => p.failures));
    for (const k of Object.keys(FAILURE_LABELS_EN) as FailureKey[])
      expect(covered.has(k), k).toBe(true);
    for (const b of LIBRARY_BASES)
      expect(lib(`${b}.en`).items.map((x) => x.id)).toEqual(
        lib(`${b}.fr`).items.map((x) => x.id),
      );
  });
});

describe("review fixes: wording per cockpit, regions, the master interlock, the engine-fire order", () => {
  it("the classic panel never reads 'G1000: BUS 1'; the G1000 drops the '(G1000)' marker", () => {
    for (const lang of ["en", "fr"] as const) {
      const p = lib(`c172.electricalFire.${lang}`);
      const steamP = procedureForCockpit(p, "steam");
      const glassP = procedureForCockpit(p, "g1000");
      for (const it of steamP.items) expect(it.text, it.id).not.toMatch(/G1000/);
      for (const it of glassP.items) expect(it.text, it.id).not.toMatch(/\(G1000\)|G1000 ?:/);
      expect(glassP.items.find((x) => x.id === "avionics")!.text).toMatch(/BUS 1|BARRE 1/);
      expect(steamP.items.find((x) => x.id === "avionics")!.text).not.toMatch(/BUS|BARRE/);
      // the library text (editor, both cockpits listed) keeps the marker
      expect(p.items.find((x) => x.id === "stbyBatt")!.text).toMatch(/\(G1000\)/);
    }
  });

  it("US territories fly 14 CFR; the ICAO card is titled by the ICAO rule, not as EASA everywhere", () => {
    for (const id of ["TJSJ", "TIST", "TISX", "NSTU", "PGUM", "KSFO", "1B1"]) expect(airspaceRegion(id), id).toBe("faa");
    for (const id of ["LFPN", "EGLL", "CYUL", "YSSY"]) expect(airspaceRegion(id), id).toBe("icao");
    const sera = lib("c172.lostCommsSera.en");
    expect(sera.title).toMatch(/ICAO Annex 2/);
    expect(sera.ref).toMatch(/national AIP prevails/);
  });

  it("the split master rocker is interlocked in the simulator itself: BAT OFF takes ALT with it, ALT ON brings BAT", () => {
    const s = new Sim();
    s.load(SCENARIOS.find((x) => x.id === "free")!);
    s.setSwitch("batMaster", false);
    expect(s.sw.altMaster).toBe(false);
    s.setSwitch("altMaster", true);
    expect(s.sw.batMaster).toBe(true);
    // ALT alone can still be switched OFF (the LOW VOLTS procedure)
    s.setSwitch("altMaster", false);
    expect(s.sw.batMaster).toBe(true);
  });

  it("G1000 bus mapping: GPS1 rides with the PFD on the essential bus, so shedding AVIONICS BUS 1 keeps the GPS", () => {
    const s = new Sim();
    s.load(SCENARIOS.find((x) => x.id === "free")!);
    s.cockpit = "g1000";
    s.setSwitch("avionics", false);
    expect(s.sys.elec.gps && s.sys.elec.pfd && s.sys.elec.com1).toBe(true);
    expect(s.sys.elec.mfd).toBe(false);
    s.cockpit = "steam";
    s.setSwitch("avionics", true);
    s.setSwitch("avionics", false);
    expect(s.sys.elec.gps).toBe(false);
  });

  it("the QRH-facing checks credit pilot actions only: battery 'leave ON' is a callout, the fuel leak wants the leaking tank", () => {
    expect(lib("c172.battery.en").items.find((x) => x.id === "noCycle")!.check).toEqual({ id: "manual" });
    expect(CHECKS.switch.evaluate(v({ sw: { ...v().sw, fuelSelector: "RIGHT" } }), { key: "fuelSelector", value: "LEFT" }, ctx)).toBe(false);
    for (const b of ["c172.ahrs", "c172.airData"]) expect(lib(`${b}.en`).items.some((x) => x.id === "cb"), b).toBe(true);
    const hv = lib("c172.highVolts.en");
    const ix = (id: string) => hv.items.findIndex((x) => x.id === id);
    expect(ix("bus1")).toBeGreaterThan(ix("altOff"));
    expect(ix("bus2")).toBeGreaterThan(ix("bus1"));
  });
});
