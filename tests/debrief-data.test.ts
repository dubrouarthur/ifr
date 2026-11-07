// Debrief replay: the pure data builders (src/ui/result/debriefData.ts, signoff.ts, debriefSource.ts). An exercise
// is graded by its own standards (never "not enough flight to grade"), re-timed onto the replay clock; a free flight
// by the FAA ACS evaluation; lanes, moments, the state table, CSV export, and the locked instructor sign-off.
import { describe, it, expect } from "vitest";
import {
  acsPct,
  eventLanes,
  eventsCsv,
  fromFlight,
  fromReport,
  kpisOf,
  laneOf,
  momentAt,
  momentsOf,
  neighbourTime,
  phasesOf,
  sampleAt,
  samplesCsv,
  stateRows,
  type StdRow,
} from "../src/ui/result/debriefData";
import {
  signoffs,
  lockHash,
  lockText,
  verifySignOff,
  initials,
  type SignOff,
} from "../src/ui/result/signoff";
import { approachGeom, plateGeom } from "../src/ui/result/debriefSource";
import { DEBRIEF_KEYS, dx } from "../src/ui/result/debriefStrings";
import { buildReport } from "../src/ui/result/report";
import { findApproach } from "../src/nav/data";
import type { AcsReport, FlightEvent, Sample } from "../src/sim/recorder";
import type { ResultInput, Span, TracePoint } from "../src/ui/result/types";

const trace = (sec: number, alt: (t: number) => number): TracePoint[] =>
  Array.from({ length: Math.floor(sec / 0.5) + 1 }, (_, i) => ({
    t: i * 0.5,
    alt: alt(i * 0.5),
    ias: 100,
    hdg: 90,
    vs: 0,
    lat: 45,
    lon: 6,
  }));

function input(o: Partial<ResultInput> = {}): ResultInput {
  return {
    lang: "en",
    ex: {
      id: "bai-sl",
      title: "Straight and level",
      stage: "S1",
      allowAp: false,
      minutes: 4,
    },
    endedBy: "complete",
    passed: false,
    reason: "Out of tolerance for 35 s (allowed 10 s)",
    durationSec: 180,
    allowanceSec: 10,
    steps: [
      {
        text: "Maintain 4000 ft, heading 090, 100 KIAS for 3 min",
        done: false,
        violationSec: 35,
        worst: "Altitude -271 ft",
        t0: 0,
        t1: 180,
      },
    ],
    idx: 0,
    spans: [
      {
        step: 0,
        kind: "alt",
        t0: 48,
        t1: 79,
        text: "Altitude -271 ft",
        worst: -271,
        tWorst: 64,
      } as Span,
    ],
    measured: {
      hdg: { maxAbs: 2, min: -2, max: 1, t: 30, target: 90, step: 0 },
      ias: { maxAbs: 5, min: -5, max: 3, t: 90, target: 100, step: 0 },
    },
    trace: trace(180, (t) => (t > 48 && t < 79 ? 3800 : 4000)),
    events: [
      { t: 0, kind: "info", text: "Training: exercise" },
      { t: 20, kind: "info", text: "Set up with help: NAV1 110.30" },
    ],
    handFlown: true,
    checkride: false,
    attempt: { n: 2, at: Date.UTC(2026, 10, 6, 17, 42) },
    ...o,
  };
}

const ev = (
  t: number,
  text: string,
  kind: FlightEvent["kind"] = "info",
): FlightEvent => ({ t, kind, text });

const sample = (t: number, o: Partial<Sample> = {}): Sample => ({
  t,
  lat: 45,
  lon: 6 + t / 1000,
  alt: 3000,
  agl: 2000,
  ias: 100,
  vs: 0,
  hdg: 90,
  bank: 0,
  pitch: 2,
  latDots: 0,
  vertDots: null,
  ap: false,
  phase: "enroute",
  visual: false,
  mins: null,
  ...o,
});

describe("lanes: recorder events by lane", () => {
  it("classifies failures, ATC, help, deviations and procedure items", () => {
    expect(laneOf(ev(1, "FAILURE: Vacuum pump", "warn"))).toBe("failure");
    expect(laneOf(ev(1, "Restored: Vacuum pump"))).toBe("failure");
    expect(laneOf(ev(1, "Instructor: failed AHRS"))).toBe("failure");
    expect(laneOf(ev(1, "ATC: altimeter 29.92"))).toBe("atc");
    expect(laneOf(ev(1, "ATC (instructor): direct ARD"))).toBe("atc");
    expect(laneOf(ev(1, "Set up with help: NAV1"))).toBe("help");
    expect(laneOf(ev(1, "Instructor: reposition"))).toBe("help");
    expect(laneOf(ev(1, "CRASH — Hard impact (-2100 fpm)", "bad"))).toBe(
      "deviation",
    );
    expect(laneOf(ev(1, "Stall warning at 48 KIAS", "bad"))).toBe("deviation");
    expect(laneOf(ev(1, "LOC captured", "good"))).toBe("procedure");
    expect(laneOf(ev(1, "Crossed FAF MARLO at 2436 ft"))).toBe("procedure");
    expect(laneOf(ev(1, "Training: exercise"))).toBeNull();
    expect(laneOf(ev(1, "FMS insert: ARD"))).toBeNull();
  });
  it("clamps to the flight and skips the lanes another source fills", () => {
    const L = eventLanes(
      "en",
      [
        ev(-5, "LOC captured"),
        ev(10, "LOC captured"),
        ev(20, "Set up with help: X"),
        ev(999, "Touchdown"),
      ],
      100,
      ["help"],
    );
    expect(L.procedure.map((x) => x.t)).toEqual([10]);
    expect(L.help).toEqual([]);
  });
  it("labels events in French", () => {
    const L = eventLanes(
      "fr",
      [
        ev(10, "LOC captured", "good"),
        {
          t: 12,
          kind: "warn",
          text: "FAILURE: Vacuum",
          fr: "PANNE : Dépression",
        },
      ],
      100,
    );
    expect(L.procedure[0].label).toBe("LOC capté");
    expect(L.failure[0].label).toBe("PANNE : Dépression");
  });
});

describe("standards and KPIs", () => {
  it("reads the tolerance used of an ACS row in the same unit", () => {
    expect(
      acsPct("≤ ¾-scale CDI deflection (1.5 dots)", "max 0.30 dots"),
    ).toBeCloseTo(0.2, 5);
    expect(acsPct("90 KIAS ±10 kt", "max dev 6 kt")).toBeCloseTo(0.6, 5);
    expect(
      acsPct("Continue only with visual references", "lights in sight"),
    ).toBeNull();
    expect(acsPct("±100 ft", "1.2 dots")).toBeNull();
  });
  it("puts the failed standard first, then the closest to its limit", () => {
    const rows: StdRow[] = [
      {
        id: "a",
        label: "Localizer",
        tol: "¾ scale",
        flew: "0.3 dot",
        verdict: "met",
        pct: 0.2,
      },
      {
        id: "b",
        label: "Glideslope",
        tol: "¾ scale",
        flew: "1.1 dot",
        verdict: "met",
        pct: 0.73,
      },
      {
        id: "c",
        label: "Altitude",
        tol: "−100 ft",
        flew: "2,227 ft",
        verdict: "not-met",
        pct: 1.73,
      },
      {
        id: "d",
        label: "Missed",
        tol: "climb",
        flew: "not flown",
        verdict: "not-reached",
        pct: null,
      },
    ];
    const k = kpisOf(rows);
    expect(k.map((x) => x.label)).toEqual([
      "Altitude",
      "Glideslope",
      "Localizer",
    ]);
    expect(k[0]).toMatchObject({ value: "2,227", unit: "ft", bad: true });
    expect(kpisOf(rows, 2)).toHaveLength(2);
  });
});

describe("fromReport: an exercise, graded by its own standards", () => {
  const inp = input();
  const rep = buildReport(inp);
  const m = fromReport({
    lang: "en",
    rep,
    inp,
    toClip: (t) => t + 12,
    durS: 192,
    events: [
      ev(0, "Training: exercise"),
      ev(32, "Set up with help: NAV1 110.30"),
      ev(60, "FAILURE: Vacuum pump", "warn"),
    ],
    attemptId: "a1",
    dateMs: inp.attempt.at,
  });

  it("keeps the verdict and counts of the result", () => {
    expect(m.source).toBe("exercise");
    expect(m.outcome).toBe("not-met");
    expect(m.metCount).toBe(rep.metCount);
    expect(m.gradedCount).toBe(rep.gradedCount);
    expect(m.standards.length).toBe(rep.standards.length);
    expect(m.standards[0].verdict).toBe("not-met");
    expect(m.kpis[0].bad).toBe(true);
    expect(m.task).toMatch(/IR\.IV\.A/);
  });
  it("moves every time onto the replay clock", () => {
    const f = m.findings[0];
    expect(f.t0).toBeCloseTo(rep.findings[0].t0 + 12, 5);
    expect(f.tWorst).toBeCloseTo(rep.findings[0].tWorst + 12, 5);
    expect(m.lanes.deviation[0]).toMatchObject({ n: 1, kind: "bad" });
    expect(m.lanes.deviation[0].t).toBeCloseTo(f.t0, 5);
    expect(m.phases[0].t0).toBeCloseTo(12, 5);
  });
  it("lists help from the report (not from the raw events twice) and the other lanes from the events", () => {
    expect(m.help.length).toBe(rep.help.length);
    expect(m.lanes.help.map((x) => x.label)).toEqual([
      "Set for you (“Set it”): NAV1 110.30",
    ]);
    expect(m.lanes.failure.map((x) => x.label)).toEqual([
      "FAILURE: Vacuum pump",
    ]);
    expect(m.withHelp).toBe(rep.withHelp);
  });
  it("an exercise ended early is not graded, with a reason, never 'not enough flight'", () => {
    const i2 = input({
      endedBy: "user",
      passed: false,
      durationSec: 60,
      spans: [],
      trace: trace(60, () => 4000),
      steps: [
        {
          text: "Maintain 4000 ft, heading 090, 100 KIAS for 3 min",
          done: false,
          violationSec: 0,
          worst: null,
          t0: 0,
        },
      ],
    });
    const r2 = buildReport(i2);
    const m2 = fromReport({
      lang: "en",
      rep: r2,
      inp: i2,
      toClip: (t) => t,
      durS: 60,
      events: [],
      attemptId: "a2",
      dateMs: 0,
    });
    expect(m2.outcome).toBe("ungraded");
    expect(m2.note).toBeTruthy();
    expect(JSON.stringify(m2)).not.toMatch(/Not enough flight|\d+\s*\/\s*100/);
  });
  it("puts the finding first in the moments, events after it with All events", () => {
    const a = momentsOf(m, false);
    expect(a.every((x) => x.kind === "finding")).toBe(true);
    const b = momentsOf(m, true);
    expect(b.length).toBe(
      a.length +
        m.lanes.failure.length +
        m.lanes.procedure.length +
        m.lanes.help.length +
        m.lanes.atc.length,
    );
    expect(b.slice(a.length).map((x) => x.t)).toEqual(
      [...b.slice(a.length).map((x) => x.t)].sort((p, q) => p - q),
    );
  });
  it("snaps to the finding under the playhead, ±3 s", () => {
    const list = momentsOf(m, true);
    const f = m.findings[0];
    expect(momentAt(list, (f.t0 + f.t1) / 2)).toBe(0);
    expect(momentAt(list, f.t1 + 2)).toBe(0);
    expect(momentAt(list, f.t1 + 30)).toBe(-1);
  });
  it("steps to the previous and next lane items", () => {
    const f = m.findings[0];
    expect(neighbourTime(m, 0, 1)).toBeCloseTo(Math.min(32, f.t0), 5);
    const all = [...Object.values(m.lanes).flat().map((x) => x.t), ...m.findings.map((q) => q.t0)];
    expect(neighbourTime(m, 1000, -1)).toBeCloseTo(Math.max(...all), 5);
    expect(neighbourTime(m, 1000, 1)).toBeNull();
  });
  it("speaks French when asked", () => {
    const fr = fromReport({
      lang: "fr",
      rep: buildReport({ ...inp, lang: "fr" }),
      inp: { ...inp, lang: "fr" },
      toClip: (t) => t,
      durS: 180,
      events: [],
      attemptId: "a1",
      dateMs: inp.attempt.at,
    });
    expect(fr.meta).toMatch(/nov\./);
    expect(fr.findings[0].title).not.toBe(m.findings[0].title);
  });
});

describe("fromFlight: a free flight, graded by the ACS evaluation", () => {
  const acs: AcsReport = {
    result: "FAIL",
    items: [
      {
        task: "Lateral guidance FAF → minimums",
        standard: "≤ ¾-scale CDI deflection (1.5 dots)",
        actual: "max 2.10 dots",
        result: "FAIL",
      },
      {
        task: "Missed approach",
        standard: "Climb, turn, altitude, hold",
        actual: "not flown",
        result: "N/A",
      },
      {
        task: "Airspeed on final",
        standard: "90 KIAS ±10 kt",
        actual: "max dev 4 kt",
        result: "PASS",
      },
    ],
  };
  const samples = [
    ...Array.from({ length: 40 }, (_, i) => ({
      t: i,
      phase: "initial" as const,
    })),
    ...Array.from({ length: 60 }, (_, i) => ({
      t: 40 + i,
      phase: "final" as const,
    })),
  ];
  const events = [
    ev(5, "LOC captured", "good"),
    ev(50, "Stall warning at 50 KIAS", "bad"),
    ev(
      70,
      "No visual references at minimums — missed approach required",
      "warn",
    ),
    ev(80, "ATC: altimeter 29.92"),
  ];
  it("maps PASS / FAIL / N/A, numbers the warnings as moments", () => {
    const m = fromFlight({
      lang: "en",
      samples,
      events,
      acs,
      durS: 100,
      title: "ILS 27",
      attemptId: "f1",
      dateMs: 0,
    });
    expect(m.outcome).toBe("not-met");
    expect([m.metCount, m.gradedCount]).toEqual([1, 2]);
    expect(m.standards.map((s) => s.verdict)).toEqual([
      "not-met",
      "not-reached",
      "met",
    ]);
    expect(m.standards[0].pct).toBeCloseTo(1.4, 5);
    expect(m.lanes.deviation.map((x) => x.n)).toEqual([1, 2]);
    expect(momentsOf(m, false).map((x) => x.label)).toEqual([
      "Stall warning at 50 KIAS",
      "No visual references at minimums — missed approach required",
    ]);
    expect(m.phases.map((p) => p.label)).toEqual(["Initial approach", "Final"]);
  });
  it("INCOMPLETE is the Ungraded state with its reason", () => {
    const m = fromFlight({
      lang: "fr",
      samples,
      events: [],
      acs: { result: "INCOMPLETE", items: [] },
      durS: 100,
      title: "Vol libre",
      attemptId: "f2",
      dateMs: 0,
    });
    expect(m.outcome).toBe("ungraded");
    expect(m.note).toBe(dx("fr", "d.flightUngraded"));
  });
  it("an exercise still flying is never graded here", () => {
    const m = fromFlight({
      lang: "en",
      samples,
      events,
      acs,
      durS: 100,
      title: "Straight and level",
      inProgress: true,
      attemptId: "f3",
      dateMs: 0,
    });
    expect(m.outcome).toBe("ungraded");
    expect(m.standards).toEqual([]);
    expect(m.note).toMatch(/still flying/);
  });
});

describe("phases, samples and the state table", () => {
  it("merges flickers shorter than 8 s into their neighbour", () => {
    const S = [
      0, 1, 2, 3, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 40,
    ].map((t) => ({
      t,
      phase: (t >= 20 && t < 22 ? "final" : t < 40 ? "initial" : "final") as
        | "final"
        | "initial",
    }));
    const P = phasesOf("en", S);
    expect(P.every((p) => p.t1 - p.t0 >= 0)).toBe(true);
    expect(P[0].label).toBe("Initial approach");
  });
  it("interpolates a sample, heading across north", () => {
    const S = [
      sample(0, { hdg: 350, alt: 3000 }),
      sample(1, { hdg: 10, alt: 3100 }),
    ];
    const s = sampleAt(S, 0.5)!;
    expect(s.alt).toBeCloseTo(3050, 5);
    expect(Math.round(s.hdg)).toBe(0);
    expect(sampleAt([], 1)).toBeNull();
    expect(sampleAt(S, -5)!.alt).toBe(3000);
    expect(sampleAt(S, 99)!.alt).toBe(3100);
  });
  it("flags values beyond the standard: ±100 ft of the target, ¾ scale (1.5 dots)", () => {
    const rows = stateRows("en", {
      alt: 3880,
      target: { v: 4000, band: 100 },
      vs: -380,
      ias: 100,
      hdg: 90,
      trk: 92,
      latDots: -1.8,
      vertDots: 0.4,
      loc: true,
      altSel: 4000,
      rpm: 2300,
      ap: false,
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.alt.bad).toBe(true);
    expect(by.dev.value).toBe("−120 ft");
    expect(by.lat).toMatchObject({
      label: "Localizer",
      value: "1.8 dot L",
      bad: true,
    });
    expect(by.gs).toMatchObject({ value: "0.4 dot fly-up", bad: false });
    expect(by.sel.value).toBe("4,000 ft");
    expect(by.pwr.value).toBe("2,300 RPM · off");
    // below 200 ft AGL the tracking standard no longer applies (DA): shown, not flagged
    const low = stateRows("en", {
      alt: 600,
      vs: -500,
      ias: 70,
      hdg: 270,
      latDots: 2.4,
      vertDots: 2.4,
      ap: false,
      gradeDots: false,
    });
    expect(low.find((r) => r.key === "gs")!.bad).toBe(false);
    const fr = stateRows("fr", {
      alt: 2227,
      vs: -20,
      ias: 95,
      hdg: 268,
      latDots: 0.05,
      vertDots: null,
      ap: true,
      apModes: "LOC · GS",
    });
    expect(fr.find((r) => r.key === "alt")!.value).toBe("2\u202f230 ft");
    expect(fr.find((r) => r.key === "lat")!.value).toBe("centré");
    expect(fr.find((r) => r.key === "pwr")!.value).toBe("— · AP LOC · GS");
  });
});

describe("export (SPEC §7)", () => {
  it("writes one CSV row per sample on the replay clock", () => {
    const csv = samplesCsv(
      [sample(100), sample(100.5, { latDots: null })],
      100,
    ).split("\n");
    expect(csv[0]).toBe(
      "t,lat,lon,alt_ft,agl_ft,ias_kt,vs_fpm,hdg,bank,pitch,lat_dots,vert_dots,ap,phase",
    );
    expect(
      csv[1].startsWith("0.0,45.000000,6.100000,3000,2000,100,0,90,"),
    ).toBe(true);
    expect(csv[2].split(",")[10]).toBe("");
  });
  it("writes the events with their lane, pin and standard, quoted", () => {
    const inp = input();
    const rep = buildReport(inp);
    const m = fromReport({
      lang: "en",
      rep,
      inp,
      toClip: (t) => t,
      durS: 180,
      events: [ev(5, 'ATC: "cleared", ILS 27')],
      attemptId: "a",
      dateMs: 0,
    });
    const csv = eventsCsv(m).split("\n");
    expect(csv[0]).toBe("t,t1,lane,n,text,standard_id,pct_of_limit");
    expect(csv.some((l) => /,deviation,1,/.test(l))).toBe(true);
    expect(csv.find((l) => l.includes(",atc,"))).toBe(
      '5.0,,atc,,"ATC: ""cleared"", ILS 27",,',
    );
  });
});

describe("sign-off (SPEC §6), stored on this device", () => {
  const mem = () => {
    const d: Record<string, string> = {};
    return {
      getItem: (k: string) => d[k] ?? null,
      setItem: (k: string, v: string) => void (d[k] = v),
    };
  };
  const so = (o: Partial<SignOff> = {}): SignOff => ({
    by: { name: "Claire Martin", role: "FI(A) IRI" },
    grade: "repeat",
    notes: "Rework the level-off.",
    tags: ["Altitude"],
    at: "2026-11-06T17:50:00Z",
    draft: false,
    ...o,
  });
  it("locks a signed record: a later write without reopening does not replace it", async () => {
    const s = mem();
    const a = so();
    a.lockHash = await lockHash(lockText("x", "not-met", a));
    signoffs.put("x", a, s);
    const kept = signoffs.put(
      "x",
      so({ grade: "satisfactory", lockHash: "other" }),
      s,
    );
    expect(kept.grade).toBe("repeat");
    expect(signoffs.get("x", s)!.grade).toBe("repeat");
    // reopen (draft) then sign again
    signoffs.put("x", { ...a, draft: true, lockHash: undefined }, s);
    expect(signoffs.get("x", s)!.draft).toBe(true);
  });
  it("hashes what it covers: grade and notes edits break the signature", async () => {
    const a = so();
    a.lockHash = await lockHash(lockText("x", "not-met", a));
    expect(a.lockHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifySignOff("x", "not-met", a)).toBe(true);
    expect(await verifySignOff("x", "not-met", { ...a, notes: "edited" })).toBe(
      false,
    );
    expect(await verifySignOff("x", "met", a)).toBe(false);
    // a lock made without WebCrypto (plain-http iPad) is checked with its own algorithm
    const f = so({ lockHash: undefined });
    const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      f.lockHash = await lockHash(lockText("x", "not-met", f));
      expect(f.lockHash).toMatch(/^fnv1a-/);
      // a SHA-256 lock cannot be checked on such a page: unknown, not "edited"
      expect(await verifySignOff("x", "not-met", a)).toBe(null);
    } finally {
      if (saved) Object.defineProperty(globalThis, "crypto", saved);
    }
    expect(await verifySignOff("x", "not-met", f)).toBe(true);
    expect(await verifySignOff("x", "not-met", { ...f, grade: "satisfactory" })).toBe(false);
    // a reopen is covered by the next signature
    expect(lockText("x", "met", { ...a, reopened: [{ by: "A", at: "t" }] })).not.toBe(lockText("x", "met", a));
    expect(lockText("x", "met", { ...a, tags: ["b", "a"] })).toBe(
      lockText("x", "met", { ...a, tags: ["a", "b"] }),
    );
  });
  it("remembers the instructor and makes initials", () => {
    const s = mem();
    expect(signoffs.me(s)).toEqual({ name: "", role: "" });
    signoffs.setMe({ name: "Claire Martin", role: "CFII" }, s);
    expect(signoffs.me(s).name).toBe("Claire Martin");
    expect(initials("Claire Martin")).toBe("CM");
    expect(initials("  ")).toBe("—");
  });
});

describe("the plate: plan view path and profile (PARD ILS 27)", () => {
  it("lists the fixes with role and altitude, the runway with its DA, and the final-segment profile", () => {
    const ap = findApproach("PARD-I27")!;
    expect(ap).toBeTruthy();
    const g = approachGeom(ap);
    expect(g.fixes.find((f) => f.ident === "MARLO")).toMatchObject({
      role: "FAF",
    });
    expect(
      g.fixes.some(
        (f) => /^PARD 27$/.test(f.ident) && /^DA \d+/.test(f.role ?? ""),
      ),
    ).toBe(true);
    expect(g.paths.length).toBeGreaterThan(0);
    const p = plateGeom(ap, 670)!;
    expect(p.minsKind).toBe("DA");
    expect(p.gsAngle).toBeGreaterThan(2.5);
    const marlo = p.legs.find((l) => l.ident === "MARLO")!;
    expect(marlo.d).toBeGreaterThan(3);
    expect(marlo.d).toBeLessThan(10);
  });
});

describe("the profile of a non-precision approach", () => {
  it("draws a step-down floor at the published altitude itself, labelled as a minimum, never 100 ft below", async () => {
    const { profileSvg } = await import("../src/ui/result/debriefCharts");
    const plate = {
      name: "TEST LOC 27",
      thr: { lat: 45, lon: 6 },
      end: { lat: 45, lon: 5.97 },
      elevFt: 400,
      legs: [
        { ident: "FAF", d: 6, altMin: 2100, role: "FAF" },
        { ident: "SDF", d: 3, altMin: 1400 },
        { ident: "MAP", d: 0.5 },
      ],
      mins: 900,
      minsKind: "MDA" as const,
    };
    // a straight-in track from 8 NM to the threshold, 2,600 ft down to 900 ft
    const track = Array.from({ length: 40 }, (_, i) => {
      const f = i / 39;
      return { t: i * 6, lat: 45, lon: 6 + (8 * (1 - f)) / (60 * Math.cos((45 * Math.PI) / 180)), alt: 2600 - 1700 * f };
    });
    const d = profileSvg(900, 300, "dist", track, 240, plate, [], { L: "en" })!;
    expect(d.svg).toContain("minimum 2,100 ft");
    expect(d.svg).not.toMatch(/lowest allowed|minimum 2,000/);
    const y = d.yOf(2100).toFixed(1);
    expect(d.svg).toContain(`y1="${y}" y2="${y}" class="floor-ln"`);
  });
});

describe("strings", () => {
  it("has every debrief key in French", () => {
    expect([...DEBRIEF_KEYS.fr].sort()).toEqual([...DEBRIEF_KEYS.en].sort());
  });
  it("never uses the words the spec refuses", () => {
    for (const l of ["en", "fr"] as const)
      for (const k of DEBRIEF_KEYS[l])
        expect(dx(l, k)).not.toMatch(/\bscore\b|approved|loggable|\bcredit\b/i);
  });
});

describe("debriefOpen on a real Sim: an exercise is graded, a short free flight is 'Not graded'", () => {
  it("re-grades a finished exercise on the replay clock, in either language", async () => {
    const { Sim } = await import("../src/sim/sim");
    const { LessonRun } = await import("../src/train/engine");
    const { exercise } = await import("../src/train/curriculum");
    const { ResultObserver, inputFromRun } = await import("../src/ui/result/observe");
    const { debriefOpen } = await import("../src/ui/result/debriefSource");
    const sim = new Sim();
    const run = new LessonRun(exercise("bai-sl"), sim);
    const obs = new ResultObserver();
    const DT = 1 / 30;
    for (let t = 0; t < 60; t += DT) {
      sim.controls.elevator = t > 20 ? 0.25 : 0;
      sim.step(DT);
      run.update(DT);
      obs.tick(run);
      if (run.finished) break;
    }
    if (!run.finished) run.abort();
    obs.tick(run);
    const inp = inputFromRun(run, obs, { lang: "en", endedBy: "complete", attempt: { n: 1, at: 0 } });
    const o = debriefOpen(sim, { inp, plan: () => ({ why: { lead: "", text: "" }, items: [] }), toSim: (t) => obs.toSim(t), attemptId: "x" }, null);
    expect(sim.rec.samples.length).toBeGreaterThan(50);
    expect(o.t0).toBe(sim.rec.samples[0].t);
    const en = o.build("en");
    const fr = o.build("fr");
    expect(en.source).toBe("exercise");
    expect(en.title).toBe(run.ex.title);
    expect(en.durS).toBeGreaterThan(50);
    expect(fr.standards.length).toBe(en.standards.length);
    expect(JSON.stringify(en)).not.toMatch(/Not enough flight|\d+\s*\/\s*100/);
    for (const f of en.findings) {
      expect(f.t0).toBeGreaterThanOrEqual(0);
      expect(f.t1).toBeLessThanOrEqual(en.durS + 0.01);
    }
  });
  it("a free flight with no approach flown is Not graded, with the reason", async () => {
    const { Sim } = await import("../src/sim/sim");
    const { debriefOpen } = await import("../src/ui/result/debriefSource");
    const sim = new Sim();
    sim.rec.start(sim);
    for (let t = 0; t < 30; t += 1 / 30) sim.step(1 / 30);
    const m = debriefOpen(sim, null, { title: "Free flight", attemptId: "f" }).build("en");
    expect(m.source).toBe("flight");
    expect(m.outcome).toBe("ungraded");
    expect(m.note).toBe(dx("en", "d.flightUngraded"));
    expect(m.phases.length).toBeGreaterThan(0);
    const inProg = debriefOpen(sim, null, { title: "Straight and level", inProgress: true, attemptId: "f" }).build("fr");
    expect(inProg.task).toBe(dx("fr", "d.inProgress"));
    expect(inProg.standards).toEqual([]);
  });
});

describe("KPIs read times and maxima", () => {
  it("keeps a lap time whole and drops the 'max' prefix", () => {
    const k = kpisOf([
      { id: "a", label: "Inbound leg", tol: "1:00 ±0:15", flew: "0:59 last lap", verdict: "met", pct: 0.1 },
      { id: "b", label: "Glideslope", tol: "¾ scale", flew: "max 0.99 dots", verdict: "met", pct: 0.66 },
      { id: "c", label: "Aircraft control", tol: "No accident", flew: "Touched down off-airport", verdict: "not-met", pct: null },
    ]);
    expect(k.map((x) => [x.value, x.unit])).toEqual([
      ["0.99", "dots"],
      ["0:59", "last lap"],
    ]);
  });
});

describe("recorder events in French (lanes)", () => {
  it("translates the approach milestones and the touchdown", async () => {
    const { eventLabel } = await import("../src/ui/result/report");
    expect(eventLabel("fr", { text: "Autopilot engaged" })).toBe("Pilote automatique engagé");
    expect(eventLabel("fr", { text: "Crossed FAF MARLO at 2435 ft" })).toBe("FAF MARLO passé à 2 435 ft");
    expect(eventLabel("fr", { text: "Touchdown RWY 27 PARD at 337 fpm, 60 KIAS, 125 ft right of centerline" })).toBe("Toucher piste 27 PARD à 337 ft/min, 60 KIAS, 125 ft à droite de l’axe");
    expect(eventLabel("fr", { text: "Minimums — LAT -0.0 dots, VERT 0.6 dots, 76 KIAS" })).toBe("Minima — LAT -0,0 pt, VERT 0,6 pt, 76 KIAS");
    expect(eventLabel("en", { text: "Autopilot engaged" })).toBe("Autopilot engaged");
  });
});
