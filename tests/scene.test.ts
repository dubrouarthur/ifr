// Scene capture / apply fidelity (SPEC §9.3): round trips, the TRK = HDG + WCA fix, LOC/GS dots, seeded turbulence,
// holds that resequence from the fix, fields scenes, ?scene= links and validation.
import { describe, expect, it } from "vitest";
import { Sim, SCENARIOS } from "../src/sim/sim";
import { startAt } from "../src/train/engine";
import { steadyWind } from "../src/sim/wind";
import { findFix, runway } from "../src/nav/data";
import {
  bearingDeg,
  destination,
  DEG,
  distanceNm,
  wrap180,
} from "../src/nav/geo";
import { FT, KT } from "../src/sim/environment";
import type { SimScene } from "../src/course/types";
import {
  applyScene,
  applyStagePose,
  captureScene,
  compactScene,
  decodeScene,
  encodeScene,
  fieldsOf,
  NOT_CAPTURED,
  parseIdents,
  planIdents,
  poseScene,
  rederive,
  sceneSummary,
  sceneFromFields,
  stagePoseOf,
  validateScene,
  verifyLine,
  verifyOf,
} from "../src/course/scene";

const run = (s: Sim, secs: number, stop?: () => boolean, dt = 0.1) => {
  for (let t = 0; t < secs; t += dt) {
    s.step(dt);
    if (stop?.()) return t;
  }
  return secs;
};
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const metres = (
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) => distanceNm(a, b) * 1852;

/** the expected ground track from the wind triangle (TAS along the heading + the steady wind at altitude) */
function windTriangleTrack(s: Sim): number {
  const a = s.ac.s;
  const w = steadyWind(s.weather, a.altFt, s.ac.data.aglFt);
  const vh = a.tas * Math.cos(a.gamma);
  const ve = vh * Math.sin(a.psi) + w.e * KT;
  const vn = vh * Math.cos(a.psi) + w.n * KT;
  return (Math.atan2(ve, vn) / DEG + 360) % 360;
}

/** a coupled approach flown for a while: a realistic, mid-procedure state to capture */
function flyApproach(
  id: string,
  opts: { secs?: number; cdi?: "NAV1" | "GPS"; wind?: [number, number] } = {},
): Sim {
  const s = new Sim();
  const ap0 = id;
  startAt(s, {
    pos: { lat: 0, lon: 0 },
    altFt: 3000,
    hdg: 270,
    iasKt: 95,
    weather: {
      windDir: opts.wind?.[0] ?? 300,
      windKt: opts.wind?.[1] ?? 14,
      turbulence: 0.1,
    },
  });
  s.loadApproach(ap0, null, "activate");
  s.reposition("final10");
  if (opts.cdi) s.setCdi(opts.cdi);
  const d = () => s.ac.data;
  s.ap.toggleAp(d());
  s.ap.pressHdg(d());
  s.ap.pressAlt(d());
  s.ap.pressApr(d(), s.navInputs());
  run(s, opts.secs ?? 60);
  return s;
}

function expectSamePose(a: Sim, b: Sim) {
  expect(metres(a.ac.s, b.ac.s)).toBeLessThan(1);
  expect(Math.abs(a.ac.s.altFt - b.ac.s.altFt)).toBeLessThan(1);
  expect(b.ac.s.psi).toBe(a.ac.s.psi);
  expect(b.av.obs1).toBe(a.av.obs1);
  expect(b.av.obs2).toBe(a.av.obs2);
  expect(b.av.cdi).toBe(a.av.cdi);
}

describe("captureScene → JSON → applyScene", () => {
  const cases: [string, string, "NAV1" | "GPS" | undefined][] = [
    ["ILS", "PARD-I27", "NAV1"],
    ["LOC (back course)", "PARD-B09", "NAV1"],
    ["LDA", "PARD-L36", "NAV1"],
    ["VOR", "MSVL-V21", "NAV1"],
    ["RNAV LPV", "PARD-R09", "GPS"],
    ["RNAV", "MSVL-R03", "GPS"],
    ["NDB", "PARD-N27", undefined],
  ];
  for (const [kind, id, cdi] of cases) {
    it(`round-trips a ${kind} approach (${id})`, () => {
      const a = flyApproach(id, { cdi });
      const scene = json(captureScene(a, { id: "t" }));
      const b = new Sim();
      const diffs = applyScene(b, scene);
      expect(diffs).toEqual([]);
      expectSamePose(a, b);
      expect(b.fp.approachId).toBe(id);
      expect(b.fp.active).toBe(a.fp.active);
      const va = verifyOf(a);
      const vb = verifyOf(b);
      if (va.cdiDots !== null)
        expect(Math.abs(vb.cdiDots! - va.cdiDots)).toBeLessThanOrEqual(0.05);
      if (va.gsDots !== null)
        expect(Math.abs(vb.gsDots! - va.gsDots)).toBeLessThanOrEqual(0.05);
      expect(vb.apAnnun).toBe(va.apAnnun);
      expect(Math.abs(b.ac.data.iasKt - a.ac.data.iasKt)).toBeLessThan(1.5);
      expect(Math.abs(b.ac.data.vsFpm - a.ac.data.vsFpm)).toBeLessThan(80);
      expect(b.seedValue).toBe(scene.seed);
    });
  }

  it("re-derives TRK = HDG + WCA within 2° with a crosswind (the TRK 232 / HDG 264 bug)", () => {
    const a = flyApproach("PARD-I27", { cdi: "NAV1", wind: [200, 25] });
    const b = new Sim();
    applyScene(b, json(captureScene(a)));
    const d = b.ac.data;
    expect(
      Math.abs(wrap180(d.trackSmooth - windTriangleTrack(b))),
    ).toBeLessThan(2);
    expect(
      Math.abs(wrap180(d.trackSmooth - a.ac.data.trackSmooth)),
    ).toBeLessThan(2);
    expect(
      Math.abs(wrap180(d.trackSmooth - d.hdgTrue - d.driftDeg)),
    ).toBeLessThan(2);
    // a real crosswind: the track is not the heading
    expect(Math.abs(wrap180(d.trackSmooth - d.hdgTrue))).toBeGreaterThan(5);
    expect(Math.abs(d.gsSmooth - a.ac.data.gsSmooth)).toBeLessThan(2);
    expect(
      Math.abs(
        d.turnRateDps - (9.80665 * Math.tan(b.ac.s.phi)) / b.ac.s.tas / DEG,
      ),
    ).toBeLessThan(1e-9);
  });

  it("keeps the next seconds continuous: no VS or turn-rate spike after the jump", () => {
    const a = flyApproach("MSVL-I03", { cdi: "NAV1" });
    const b = new Sim();
    applyScene(b, json(captureScene(a)));
    const vs0 = b.ac.data.vsFpm;
    b.step(1 / 60);
    expect(Math.abs(b.ac.data.vsFpm - vs0)).toBeLessThan(150);
    expect(Math.abs(b.ac.data.turnRateDps)).toBeLessThan(4);
  });

  it("does not change the scene it applies", () => {
    const a = flyApproach("PARD-I27", { cdi: "NAV1", secs: 20 });
    const scene = json(captureScene(a));
    const before = JSON.stringify(scene);
    const b = new Sim();
    applyScene(b, scene);
    b.av.nav1.active = 118;
    run(b, 5);
    expect(JSON.stringify(scene)).toBe(before);
  });

  it("restores the chronometer, controls, equipment and failures", () => {
    const a = flyApproach("PARD-N27", { secs: 30 });
    a.chronoButton(); // start
    run(a, 40);
    a.equip.dme = false;
    a.setFailure("vacuum" as never, true);
    a.controls.flaps = 1;
    const sc = json(captureScene(a));
    expect(sc.pose.kind === "exact" && sc.pose.av.timerStart).toBeCloseTo(
      -40,
      0,
    );
    const b = new Sim();
    applyScene(b, sc);
    expect(b.chrono()).toBeCloseTo(a.chrono()!, 3);
    expect(b.equip.dme).toBe(false);
    expect(b.failures["vacuum" as keyof typeof b.failures]).toBe(
      a.failures["vacuum" as keyof typeof a.failures],
    );
    expect(b.controls.flaps).toBe(1);
    expect(b.controls.throttle).toBe(a.controls.throttle);
  });

  it("gives the same turbulence over 60 s in two Sims with the same seed, and another with another seed", () => {
    const a = flyApproach("PARD-I27", { cdi: "NAV1", secs: 10 });
    a.weather.turbulence = 0.7;
    a.weather.gustKt = a.weather.windKt + 12;
    const sc = json(captureScene(a, { seed: 4183 }));
    const b = new Sim();
    const c = new Sim();
    applyScene(b, sc);
    applyScene(c, sc);
    for (let i = 0; i < 1800; i++) {
      b.step(1 / 30);
      c.step(1 / 30);
    }
    expect(c.ac.s).toEqual(b.ac.s);
    expect(c.ac.data.gustKt).toBe(b.ac.data.gustKt);
    const e = new Sim();
    applyScene(e, { ...sc, seed: 77 });
    for (let i = 0; i < 1800; i++) e.step(1 / 30);
    expect(metres(e.ac.s, b.ac.s)).toBeGreaterThan(1);
  });

  it("reports a scene captured mid-hold as notCaptured and resequences from the fix", () => {
    const s = new Sim();
    const fix = findFix("ARDEN") ?? findFix("ARD")!;
    const start = destination(fix, 90, 6);
    startAt(s, {
      pos: start,
      altFt: 4000,
      hdg: 270,
      iasKt: 95,
      weather: { windKt: 0, turbulence: 0 },
    });
    s.fp.setHold(
      { ident: fix.ident, lat: fix.lat, lon: fix.lon },
      270,
      "R",
      1,
      s.ac.s,
      4000,
    );
    const d = () => s.ac.data;
    s.ap.toggleAp(d());
    s.ap.pressAlt(d());
    s.setCdi("GPS");
    s.ap.pressNav(d(), s.navInputs());
    run(s, 900, () => s.fp.holdActive);
    expect(s.fp.holdActive).toBe(true);
    run(s, 60);
    const sc = json(captureScene(s));
    expect(sc.notCaptured).toContain(NOT_CAPTURED.hold);
    const b = new Sim();
    applyScene(b, sc);
    expect(b.fp.holdActive).toBe(false);
    const to = b.fp.wpts[b.fp.active];
    expect(to.ident).toBe(fix.ident);
    expect(to.hold).toMatchObject({ inbound: 270, turn: "R", legMin: 1 });
    // flown on, the box re-enters the hold at the fix
    const t = run(b, 900, () => b.fp.holdActive);
    expect(b.fp.holdActive).toBe(true);
    expect(t).toBeLessThan(900);
    expect(distanceNm(b.ac.s, fix)).toBeLessThan(1.5);
  });

  it("verify line reads like the editor's (dots, DME, AP, seed)", () => {
    const a = flyApproach("PARD-I27", { cdi: "NAV1", secs: 40 });
    const sc = json(captureScene(a, { seed: 4183 }));
    const b = new Sim();
    const diffs = applyScene(b, sc);
    const en = verifyLine(b, sc, diffs, "en");
    expect(en.ok).toBe(true);
    expect(en.text).toMatch(/^Re-applied as captured: LOC /);
    expect(en.text).toContain("seed 4183");
    expect(en.text).toMatch(/HDG \d{3} · TRK \d{3}/);
    const fr = verifyLine(b, sc, diffs, "fr");
    expect(fr.text).toMatch(/^Réappliquée comme capturée/);
    // a difference is reported
    const bad: SimScene = {
      ...sc,
      verify: { ...sc.verify!, activeWpt: "NOWHERE" },
    };
    const c = new Sim();
    const d2 = applyScene(c, bad);
    expect(d2.map((x) => x.field)).toEqual(["activeWpt"]);
    expect(verifyLine(c, bad, d2).text).toMatch(
      /^Re-applied with 1 difference:/,
    );
  });
});

describe("plan idents", () => {
  it("encodes PPOS, user holds, the Direct-To origin and OBS mode, and parses them back", () => {
    const s = new Sim();
    const fix = findFix("ARDEN") ?? findFix("ARD")!;
    startAt(s, {
      pos: destination(fix, 45, 8),
      altFt: 4000,
      hdg: 225,
      iasKt: 95,
    });
    s.fp.setEnroute([
      { ident: "PPOS", lat: s.ac.s.lat, lon: s.ac.s.lon },
      {
        ident: fix.ident,
        lat: fix.lat,
        lon: fix.lon,
        altMin: 3000,
        hold: { inbound: 90, turn: "L", legMin: 1.5, legNm: 4, kind: "user" },
      },
    ]);
    s.fp.directFrom = { lat: s.ac.s.lat + 0.01, lon: s.ac.s.lon };
    s.fp.setObs(true, 123);
    const ids = planIdents(s);
    expect(ids[0]).toMatch(/^PPOS@/);
    expect(ids[1]).toBe(`${fix.ident}/A3000/H090L1.5N4`);
    expect(ids.at(-2)).toMatch(/^~D@/);
    expect(ids.at(-1)).toBe("~O123");
    const p = parseIdents(ids);
    expect(p.unknown).toEqual([]);
    expect(p.wpts[1].hold).toEqual({
      inbound: 90,
      turn: "L",
      legMin: 1.5,
      legNm: 4,
      kind: "user",
    });
    expect(p.wpts[1].altMin).toBe(3000);
    expect(p.obs).toBe(123);
    expect(metres(p.directFrom!, s.fp.directFrom)).toBeLessThan(0.1);
    expect(parseIdents(["NOSUCHFIX"]).unknown).toEqual(["NOSUCHFIX"]);
  });
});

describe("fields scenes", () => {
  it("places the aircraft from fix / radial / distance and shows the requested numbers", () => {
    const fix = findFix("ARDEN") ?? findFix("ARD")!;
    const sc = sceneFromFields(
      {
        kind: "fields",
        pos: { fix: fix.ident, radial: 90, distNm: 12 },
        altFt: 4000,
        hdg: 270,
        iasKt: 100,
        radios: { nav1: 114.2, obs1: 270, cdi: "NAV1" },
      },
      { weather: { windDir: 0, windKt: 20, turbulence: 0 }, seed: 5 },
    );
    const s = new Sim();
    expect(applyScene(s, sc)).toEqual([]);
    expect(metres(s.ac.s, destination(fix, 90, 12))).toBeLessThan(1);
    expect(Math.abs(s.indicatedAlt() - 4000)).toBeLessThan(1);
    expect(Math.abs(s.ac.data.iasKt - 100)).toBeLessThan(1);
    expect(Math.abs(wrap180(s.ac.data.hdgTrue - 270))).toBeLessThan(0.01);
    expect(
      Math.abs(wrap180(s.ac.data.trackSmooth - windTriangleTrack(s))),
    ).toBeLessThan(1);
    expect(s.av.obs1).toBe(270);
    expect(s.av.nav1.active).toBe(114.2);
  });

  it("a 270° final with wind 300/12 flown on HDG 273 tracks 270 ±2 (consistent PFD)", () => {
    const r = runway("PARD", "27");
    const sc = sceneFromFields(
      {
        kind: "fields",
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 5 },
        altFt: 2000,
        hdg: 273,
        iasKt: 90,
        vsFpm: -450,
      },
      { weather: { windDir: 300, windKt: 12, turbulence: 0, aloft: [{ altFt: 3000, dir: 300, kt: 12 }] } },
    );
    const s = new Sim();
    applyScene(s, sc);
    const crs = bearingDeg(r.threshold, r.end);
    // expected: crosswind from the right, WCA ≈ +3°, so the track is the runway course
    expect(Math.abs(wrap180(s.ac.data.trackSmooth - crs))).toBeLessThan(2);
    expect(Math.abs(s.ac.data.vsFpm + 450)).toBeLessThan(10);
  });

  it("fieldsOf → sceneFromFields → applyScene keeps what is on screen", () => {
    const a = flyApproach("MSVL-V21", { cdi: "NAV1", secs: 30 });
    const f = fieldsOf(a);
    const b = new Sim();
    applyScene(b, sceneFromFields(f, { weather: json(a.weather) }));
    expect(metres(a.ac.s, b.ac.s)).toBeLessThan(1);
    expect(Math.abs(b.indicatedAlt() - a.indicatedAlt())).toBeLessThan(2);
    expect(Math.abs(b.ac.data.iasKt - a.ac.data.iasKt)).toBeLessThan(2);
    expect(b.av.obs1).toBe(Math.round(a.av.obs1));
  });

  it("refuses a position that is not in the nav data", () => {
    const sc = sceneFromFields({
      kind: "fields",
      pos: { fix: "NOSUCH", radial: 0, distNm: 1 },
      altFt: 3000,
      hdg: 0,
      iasKt: 90,
    });
    expect(() => applyScene(new Sim(), sc)).toThrow(/position/);
  });
});

describe("poseScene and stage poses", () => {
  it("poses a running Sim without reloading it (the flight record is kept)", () => {
    const a = flyApproach("PARD-I27", { cdi: "NAV1", secs: 30 });
    const sc = json(captureScene(a));
    run(a, 20);
    const samples = a.rec.samples.length;
    expect(poseScene(a, sc)).toBe(true);
    expect(a.rec.samples.length).toBe(samples);
    expect(verifyOf(a).cdiDots).toBeCloseTo(sc.verify!.cdiDots!, 1);
    expect(
      Math.abs(wrap180(a.ac.data.trackSmooth - windTriangleTrack(a))),
    ).toBeLessThan(2);
  });

  it("mirrors a presenter's pose with the presenter's TRK / GS / turn rate", () => {
    const a = flyApproach("PARD-I27", { cdi: "NAV1", secs: 30 });
    const p = stagePoseOf(a);
    const b = new Sim();
    applyScene(b, json(captureScene(a)));
    run(b, 15);
    applyStagePose(b, p, { obs1: a.av.obs1 });
    expect(metres(b.ac.s, a.ac.s)).toBeLessThan(0.5);
    expect(b.ac.data.trackSmooth).toBe(p.trk);
    expect(b.ac.data.gsSmooth).toBe(p.gs);
    expect(Math.abs(b.nav1.dev - a.nav1.dev)).toBeLessThan(0.02);
  });

  it("rederive settles the aircraft's display filters (aircraft.ts internals still exist)", () => {
    const s = new Sim();
    const ac = s.ac as unknown as Record<string, unknown>;
    for (const k of [
      "lastWind",
      "lastPsi",
      "lastAlt",
      "vsFilt",
      "iasFilt",
      "gvE",
      "gvN",
      "gFilt",
      "nz",
      "thrEff",
      "clLast",
      "clFilt",
    ])
      expect(k in ac, k).toBe(true);
    expect(typeof ac.computeData).toBe("function");
    s.ac.s.altFt += 1000;
    s.ac.s.gamma = -3 * DEG;
    rederive(s);
    expect(s.ac.data.vsFpm).toBeCloseTo(
      ((s.ac.s.tas * Math.sin(-3 * DEG)) / FT) * 60,
      3,
    );
  });
});

describe("?scene= links", () => {
  it("encodes S1.<base64url(deflate-raw)> small enough for a QR code and decodes it", async () => {
    const a = flyApproach("PARD-I27", { cdi: "NAV1", secs: 30 });
    const sc = captureScene(a, { id: "qr", label: "ILS 27, 6 NM final" });
    const code = await encodeScene(sc);
    expect(code.startsWith("S1.")).toBe(true);
    expect(code).toMatch(/^S1\.[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(1700);
    const back = await decodeScene(
      `https://x.test/index.html?scene=${code}&return=1`,
    );
    expect(back.label).toBe("ILS 27, 6 NM final");
    const b = new Sim();
    expect(applyScene(b, back)).toEqual([]);
    expect(metres(a.ac.s, b.ac.s)).toBeLessThan(1);
    expect(Math.abs(a.ac.s.altFt - b.ac.s.altFt)).toBeLessThan(1);
    expect(compactScene(sc).pose).toEqual(back.pose);
  });

  it("rejects damaged, foreign and future codes with a reason", async () => {
    await expect(decodeScene("hello")).rejects.toMatchObject({
      code: "format",
    });
    await expect(decodeScene("S1.!!!!")).rejects.toMatchObject({
      code: "corrupt",
    });
    await expect(decodeScene("S1.AAAA")).rejects.toMatchObject({
      code: "corrupt",
    });
    const v2 =
      "S0." +
      Buffer.from(JSON.stringify({ v: 2, pose: { kind: "exact" } })).toString(
        "base64url",
      );
    await expect(decodeScene(v2)).rejects.toMatchObject({ code: "version" });
    const sc = sceneFromFields({
      kind: "fields",
      pos: { lat: 1, lon: 2 },
      altFt: 3000,
      hdg: 90,
      iasKt: 90,
    });
    const s0 = "S0." + Buffer.from(JSON.stringify(sc)).toString("base64url");
    expect((await decodeScene(s0)).pose).toEqual(sc.pose);
  });
});

describe("validateScene", () => {
  it("accepts a captured scene and names unknown fixes, approaches and regions", () => {
    const a = flyApproach("PARD-I27", { cdi: "NAV1", secs: 10 });
    const sc = json(captureScene(a));
    expect(validateScene(sc)).toEqual({ ok: true, issues: [] });
    const bad1 = {
      ...sc,
      plan: {
        ...sc.plan!,
        idents: ["NOSUCH"],
        approach: { id: "XXXX-I99", transition: null, mode: "load" as const },
      },
    };
    const v1 = validateScene(bad1);
    expect(v1.ok).toBe(false);
    expect(v1.issues.map((i) => i.code).sort()).toEqual(["approach", "fix"]);
    expect(v1.issues[0].text.fr).toBeTruthy();
    const real = validateScene({
      ...sc,
      world: { kind: "real", region: "KSFO" },
    });
    expect(real.ok).toBe(false);
    expect(real.issues[0].text.en).toContain("KSFO");
    const changed = validateScene(
      { ...sc, refs: { ...sc.refs, procHash: "deadbeef", airac: "2601" } },
      { airac: "2611" },
    );
    expect(changed.ok).toBe(true);
    expect(changed.issues.map((i) => i.code).sort()).toEqual([
      "airac",
      "procChanged",
    ]);
    expect(validateScene({ v: 1 }).ok).toBe(false);
    expect(validateScene(null).ok).toBe(false);
  });

  it("a scenario start captures and applies too (ground roll scenes)", () => {
    const a = new Sim(SCENARIOS.find((x) => x.onGround) ?? SCENARIOS[0]);
    const sc = json(captureScene(a));
    const b = new Sim();
    expect(applyScene(b, sc)).toEqual([]);
    expect(b.ac.s.onGround).toBe(a.ac.s.onGround);
    expect(metres(a.ac.s, b.ac.s)).toBeLessThan(1);
  });
});

describe("sceneSummary (the editor's Scene card)", () => {
  it("reads like the mockup: ILS 27 PARD · 5.0 NM · on LOC, 2,040 ft · 90 kt · −500 fpm, 273° · 270° · wind 300/12", () => {
    const sc = sceneFromFields(
      { kind: "fields", pos: { runway: { icao: "PARD", id: "27" }, distNm: 5 }, altFt: 2040, hdg: 273, iasKt: 90, vsFpm: -500, radios: { nav1: "IPRD", cdi: "NAV1" } },
      { weather: { windDir: 300, windKt: 12, turbulence: 0, aloft: [{ altFt: 3000, dir: 300, kt: 12 }] }, plan: { idents: [], approach: { id: "PARD-I27", transition: null, mode: "load" } } },
    );
    const s = new Sim();
    applyScene(s, sc);
    const rows = Object.fromEntries(sceneSummary(s, sc, "en").map((r) => [r.key, r.value]));
    expect(rows.from).toMatch(/^Numbers · \d\d:\d\d$/);
    expect(rows.position).toBe("ILS 27 PARD · 5.0 NM · on LOC");
    expect(rows.flight).toBe("2,040 ft · 90 kt · \u2212500 fpm");
    expect(rows.hdgTrk).toMatch(/^273° · (269|270|271)° · wind 300\/12$/);
    expect(rows.radios).toMatch(/^NAV1 \d{3}\.\d\d IPRD · CRS 27\d$/);
    const fr = Object.fromEntries(sceneSummary(s, sc, "fr").map((r) => [r.key, r.value]));
    expect(fr.flight).toBe("2\u202f040 ft · 90 kt · \u2212500 fpm");
    expect(fr.position).toBe("ILS 27 PARD · 5.0 NM · sur le LOC");
  });
});
