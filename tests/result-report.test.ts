// Exercise result: the pure builders (src/ui/result/report.ts, practise.ts, observe.ts). Outcome rules (an ended
// exercise is not graded, a crash is "not met" with a safety finding), standards with their tolerance and % of
// limit, numbered findings with their four answers, help shown and never graded, practise-next ranking.
import { describe, it, expect } from "vitest";
import {
  buildReport,
  classify,
  mergeSpans,
  numberFindings,
  orderStandards,
  stepTargetAlt,
} from "../src/ui/result/report";
import {
  practiseNext,
  topFinding,
  SKILL_LESSON,
} from "../src/ui/result/practise";
import {
  stepTargets,
  ResultObserver,
  inputFromRun,
} from "../src/ui/result/observe";
import { tx, num, STRINGS } from "../src/ui/result/i18n";
import type { ResultInput, Span, TracePoint } from "../src/ui/result/types";
import { Sim } from "../src/sim/sim";
import { exercise } from "../src/train/curriculum";
import { LessonRun } from "../src/train/engine";

const trace = (
  sec: number,
  alt: (t: number) => number,
  extra: Partial<TracePoint> = {},
): TracePoint[] =>
  Array.from({ length: Math.floor(sec / 0.5) + 1 }, (_, i) => ({
    t: i * 0.5,
    alt: alt(i * 0.5),
    ias: 100,
    hdg: 90,
    vs: 0,
    lat: 45,
    lon: 6,
    ...extra,
  }));

function base(o: Partial<ResultInput> = {}): ResultInput {
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
    passed: true,
    reason: "All standards met",
    durationSec: 190,
    allowanceSec: 10,
    steps: [
      {
        text: "Maintain 4000 ft, heading 090, 100 KIAS for 3 min",
        done: true,
        violationSec: 0,
        worst: null,
        t0: 0,
        t1: 190,
      },
    ],
    idx: 0,
    spans: [],
    measured: {
      alt: { maxAbs: 42, min: -30, max: 42, t: 60, target: 4000, step: 0 },
      hdg: { maxAbs: 4, min: -4, max: 3, t: 80, target: 90, step: 0 },
      ias: { maxAbs: 5, min: -5, max: 3, t: 90, target: 100, step: 0 },
    },
    trace: trace(190, (t) => 4000 + 30 * Math.sin(t / 20)),
    events: [{ t: 0, kind: "info", text: "Training: exercise" }],
    handFlown: true,
    checkride: false,
    attempt: { n: 1, at: Date.UTC(2026, 10, 6, 17, 42) },
    ...o,
  };
}

const altSpan = (t0: number, t1: number, worst: number, step = 0): Span => ({
  step,
  kind: "alt",
  t0,
  t1,
  text: `Altitude ${worst > 0 ? "+" : ""}${worst} ft`,
  worst,
  tWorst: (t0 + t1) / 2,
});

describe("classify: step check texts", () => {
  it("reads kind, signed value and limit", () => {
    expect(classify("Altitude -180 ft")).toEqual({
      kind: "alt",
      value: -180,
      limit: 100,
    });
    expect(classify("Heading +12°")).toEqual({
      kind: "hdg",
      value: 12,
      limit: 10,
    });
    expect(classify("Overshot 270 by 14°")).toEqual({
      kind: "hdg",
      value: 14,
      limit: 10,
    });
    expect(classify("Airspeed -11 kt")).toEqual({
      kind: "ias",
      value: -11,
      limit: 10,
    });
    expect(classify("Bank 35° (max 30)")).toEqual({
      kind: "bank",
      value: 35,
      limit: 30,
    });
    expect(classify("CDI 2.1 dots (max 1.5)")).toEqual({
      kind: "track",
      value: 2.1,
      limit: 1.5,
    });
    expect(classify("Stall warning").kind).toBe("control");
    expect(classify("Below the 3000 ft constraint at KEDDY").kind).toBe(
      "constraint",
    );
    expect(classify(null).kind).toBe("other");
  });
  it("finds the held targets of a step", () => {
    expect(
      stepTargets("Maintain 4000 ft, heading 090, 100 KIAS for 3 min"),
    ).toEqual({ alt: 4000, hdg: 90, ias: 100 });
    expect(
      stepTargets(
        "Turn left to heading 270 at standard rate, maintain 4000 ft",
      ),
    ).toEqual({ alt: 4000 });
    expect(stepTargets("Climb to 5000 ft at 80 KIAS")).toEqual({});
    expect(
      stepTargetAlt(
        "Turn left to heading 270 at standard rate, maintain 4000 ft",
      ),
    ).toBe(4000);
  });
  it("merges spans of one deviation", () => {
    const m = mergeSpans([
      altSpan(10, 12, 120),
      altSpan(14, 20, 180),
      altSpan(60, 62, 110),
    ]);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ t0: 10, t1: 20, worst: 180 });
  });
});

describe("outcome rules", () => {
  it("met: green, every standard met, no 0–100 anywhere", () => {
    const r = buildReport(base());
    expect(r.outcome).toBe("met");
    expect(r.metCount).toBe(r.gradedCount);
    expect(r.gradedCount).toBe(3);
    expect(r.headline).toBe("Straight and level, altitude held within 42 ft");
    const alt = r.standards.find((s) => s.id === "step.alt")!;
    expect(alt.pct).toBeCloseTo(0.42);
    expect(alt.wording).toContain("4,000 ft ±100");
    expect(JSON.stringify(r)).not.toMatch(/\d+\s*\/\s*100|score/i);
  });

  it("ended by the student: not graded, no verdict, steps shown, resumable", () => {
    const r = buildReport(
      base({
        endedBy: "user",
        passed: false,
        durationSec: 77,
        steps: [
          {
            text: "Tune and identify",
            done: true,
            violationSec: 0,
            worst: null,
            t0: 0,
            t1: 40,
          },
          {
            text: "Track 070° to PA, maintain 3000 ft",
            done: false,
            violationSec: 0,
            worst: null,
            t0: 40,
          },
          {
            text: "At PA: teardrop entry",
            done: false,
            violationSec: 0,
            worst: null,
          },
        ],
        idx: 1,
        exStandards: ["Altitude ±100 ft", "Correct entry"],
      }),
    );
    expect(r.outcome).toBe("ungraded");
    expect(r.metCount).toBe(0);
    expect(r.gradedCount).toBe(0);
    expect(r.tiles[0]).toMatchObject({ label: "Result", value: "—" });
    expect(r.steps.map((s) => s.state)).toEqual(["done", "at", "not-reached"]);
    expect(r.headline).toBe("You stopped 1:17 in, during step 2 of 3");
    expect(r.summary).toContain("**No score**");
    expect(r.wouldGrade).toEqual(["Altitude ±100 ft", "Correct entry"]);
    expect(r.resumable).toBe(true);
    // the not-flown part of the timeline is hatched and the axis runs to the expected length
    expect(r.phases.some((p) => p.ghost)).toBe(true);
    expect(r.timelineSec).toBeGreaterThanOrEqual(240);
    expect(r.marks.events.some((e) => e.label === "You ended here")).toBe(true);
  });

  it("ended early keeps a final breach (quitting never hides a bust) but no watch items", () => {
    const r = buildReport(
      base({
        endedBy: "user",
        passed: false,
        durationSec: 80,
        steps: [
          {
            text: "Maintain 4000 ft, heading 090, 100 KIAS for 3 min",
            done: false,
            violationSec: 25,
            worst: "Altitude -180 ft",
            t0: 0,
          },
        ],
        spans: [
          altSpan(30, 55, -180),
          {
            step: 0,
            kind: "hdg",
            t0: 60,
            t1: 62,
            text: "Heading +11°",
            worst: 11,
            tWorst: 61,
          },
        ],
      }),
    );
    expect(r.outcome).toBe("ungraded");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].group).toBe("not-met");
  });

  it("crash: not met with a safety finding, never a zero score", () => {
    const r = buildReport(
      base({
        endedBy: "crash",
        passed: false,
        crashed: "Impact with terrain",
        durationSec: 252,
        steps: [
          {
            text: "Maintain 4000 ft, heading 090, 100 KIAS for 3 min",
            done: false,
            violationSec: 4,
            worst: "Altitude -2549 ft",
            t0: 0,
          },
        ],
        spans: [altSpan(240, 252, -2549)],
        events: [{ t: 252, kind: "bad", text: "CRASH — Impact with terrain" }],
      }),
    );
    expect(r.outcome).toBe("not-met");
    const f1 = r.findings[0];
    expect(f1.group).toBe("safety");
    expect(f1.title).toBe("Impact with terrain at 4:12");
    expect(f1.whatHappened).toContain("4:12");
    expect(r.headline).toBe("Impact with terrain at 4:12");
    expect(r.summary).toMatch(/safety finding/);
    // no "0 s" in green and no negative altitude tile
    expect(
      r.tiles.some((t) => /^−\d{3,}/.test(t.value) && t.verdict === "met"),
    ).toBe(false);
  });

  it("not met: the failed standard comes first and its finding is the headline", () => {
    const r = buildReport(
      base({
        passed: false,
        reason: "Out of tolerance for 22 s (allowed 10 s)",
        steps: [
          {
            text: "Maintain 4000 ft, heading 090, 100 KIAS for 3 min",
            done: true,
            violationSec: 22,
            worst: "Altitude -180 ft",
            t0: 0,
            t1: 190,
          },
        ],
        spans: [altSpan(100, 122, -180)],
        measured: {
          alt: {
            maxAbs: 180,
            min: -180,
            max: 30,
            t: 111,
            target: 4000,
            step: 0,
          },
          hdg: { maxAbs: 3, min: -3, max: 2, t: 10, target: 90, step: 0 },
        },
        trace: trace(190, (t) => (t > 100 && t < 122 ? 3820 : 4000), {
          vs: -700,
        }),
      }),
    );
    expect(r.outcome).toBe("not-met");
    expect(r.standards[0]).toMatchObject({
      id: "step.alt",
      verdict: "not-met",
      value: "−180",
      findingN: 1,
    });
    expect(r.standards[0].pct).toBeCloseTo(1.8);
    expect(r.tiles[0].verdict).toBe("not-met");
    expect(r.metCount).toBe(1);
    expect(r.gradedCount).toBe(2);
    const f = r.findings[0];
    expect(f.title).toBe("Descended to 3,820 ft, 180 ft below 4,000");
    expect(f.whatHappened).toMatch(
      /180 ft below 4,000 for 22 s, descending at 700 fpm/,
    );
    expect(f.next).toContain("360 fpm for 180 ft".replace("360", "350"));
    expect(f.why).toMatch(/1,000 ft/);
    expect(r.headline).toBe(f.title);
    expect(r.summary).toBe("everything else was within standards");
  });

  it("a short deviation inside the grace is a watch item, not a fail", () => {
    const r = buildReport(
      base({
        steps: [
          {
            text: "Maintain 4000 ft, heading 090, 100 KIAS for 3 min",
            done: true,
            violationSec: 4,
            worst: "Altitude +130 ft",
            t0: 0,
            t1: 190,
          },
        ],
        spans: [altSpan(50, 54, 130)],
      }),
    );
    expect(r.outcome).toBe("met");
    const alt = r.standards.find((s) => s.id === "step.alt")!;
    expect(alt.verdict).toBe("met");
    // past ±100 ft (130 %) for 4 s of the 10 s allowed: met, but amber "exceeded", never "within standards"
    expect(alt.exceeded).toBe(true);
    expect(alt.wording).toContain("past the limit 4 s of the 10 s allowed");
    expect(r.tiles.find((t) => t.label === alt.label)?.exceeded).toBe(true);
    expect(r.summary).toBe("Altitude went past its limit briefly, within the time allowed");
    expect(r.summary).not.toMatch(/within (the )?(standards|limits)/);
    expect(r.findings[0].group).toBe("watch");
    expect(r.findings[0].title).toMatch(/within the grace/);
    expect(r.findings[0].stdText).toMatch(/^Past the limit/);
  });

  it("a standard inside its limit is not marked exceeded", () => {
    const r = buildReport(base());
    expect(r.standards.every((s) => !s.exceeded)).toBe(true);
  });

  it("not met: another standard past its limit within the allowance never reads 'within standards'", () => {
    const r = buildReport(
      base({
        passed: false,
        reason: "Out of tolerance for 22 s (allowed 10 s)",
        steps: [
          {
            text: "Maintain 4000 ft, heading 090, 100 KIAS for 3 min",
            done: true,
            violationSec: 27,
            worst: "Altitude -180 ft",
            t0: 0,
            t1: 190,
          },
        ],
        spans: [
          altSpan(100, 122, -180),
          { step: 0, kind: "ias", t0: 40, t1: 45, text: "Airspeed -14 kt", worst: -14, tWorst: 42 },
        ],
        measured: {
          alt: { maxAbs: 180, min: -180, max: 20, t: 111, target: 4000, step: 0 },
          ias: { maxAbs: 14, min: -14, max: 3, t: 42, target: 100, step: 0 },
        },
      }),
    );
    expect(r.outcome).toBe("not-met");
    const ias = r.standards.find((s) => s.id === "step.ias")!;
    expect(ias.verdict).toBe("met");
    expect(ias.exceeded).toBe(true);
    // the tile, the finding and the % of limit read the same signed number
    expect(ias.value).toBe("−14");
    const fi = r.findings.find((f) => f.standardId === "step.ias")!;
    expect(fi.title).toContain("−14 kt");
    expect(Math.round((fi.pct ?? 0) * 100)).toBe(Math.round((ias.pct ?? 0) * 100));
    expect(r.summary).not.toMatch(/within standards/);
    const plan = practiseNext(r, {
      lang: "en",
      ex: { id: "bai-sl", title: "Straight and level", minutes: 4 },
      hold: false,
    });
    expect(plan.why.text).not.toMatch(/within standards/);
    expect(plan.why.text).toContain("Airspeed");
  });

  it("crash: only the final dive is absorbed, an earlier altitude bust stays graded", () => {
    const r = buildReport(
      base({
        endedBy: "crash",
        passed: false,
        crashed: "Impact with terrain",
        durationSec: 126,
        steps: [
          {
            text: "Maintain 4000 ft, heading 090, 100 KIAS for 3 min",
            done: false,
            violationSec: 90,
            worst: "Altitude -3000 ft",
            t0: 0,
          },
        ],
        spans: [{ ...altSpan(33, 126, -3000), tWorst: 126 }],
        measured: { alt: { maxAbs: 3000, min: -3000, max: 10, t: 126, target: 4000, step: 0 } },
        trace: trace(126, (t) => (t < 30 ? 4000 : 4000 - (t - 30) * 30)),
        events: [{ t: 126, kind: "bad", text: "CRASH — Impact with terrain" }],
      }),
    );
    expect(r.outcome).toBe("not-met");
    const alt = r.standards.find((s) => s.id === "step.alt");
    expect(alt?.verdict).toBe("not-met");
    expect(r.findings[0].group).toBe("safety");
    const fa = r.findings.find((f) => f.standardId === "step.alt");
    expect(fa?.t0).toBe(33);
    expect(fa?.t1).toBe(116);
    expect(fa?.whatHappened).toContain("Still out of tolerance when the final dive began at 1:56");
    expect(fa?.whatHappened).not.toContain("Back within tolerance");
  });

  it("a fail the standards cannot name still names one (the engine is authoritative)", () => {
    const r = buildReport(
      base({
        passed: false,
        reason: "Holding standards not met",
        measured: {},
      }),
    );
    expect(r.outcome).toBe("not-met");
    expect(r.standards.some((s) => s.verdict === "not-met")).toBe(true);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it("steps not completed is a standard not met", () => {
    const r = buildReport(
      base({
        passed: false,
        reason: "Not all steps completed",
        steps: [
          {
            text: "A",
            done: true,
            violationSec: 0,
            worst: null,
            t0: 0,
            t1: 50,
          },
          { text: "B", done: false, violationSec: 0, worst: null, t0: 50 },
        ],
        idx: 1,
        measured: {},
      }),
    );
    const s = r.standards.find((x) => x.id === "steps")!;
    expect(s.verdict).toBe("not-met");
    expect(r.findings[0].title).toBe("1 of 2 steps completed");
  });
});

describe("holds", () => {
  const hold = (
    o: Partial<NonNullable<ResultInput["hold"]>> = {},
  ): NonNullable<ResultInput["hold"]> => ({
    fix: { ident: "PA", lat: 45, lon: 6 },
    inbound: 270,
    turn: "R",
    legMin: 1,
    altFt: 3000,
    crossedAt: 180,
    arrivalCourse: 70,
    correctEntry: "TEARDROP",
    flownEntry: "TEARDROP",
    okEntries: ["TEARDROP"],
    inboundTimes: [47, 63],
    outboundTimes: [46, 62],
    laps: 2,
    maxAltDev: 74,
    altOutSec: 0,
    maxNonHoldingSide: 0.2,
    maxHoldingSide: 2.1,
    ...o,
  });
  it("met with help: tiles for entry, altitude, inbound, protected airspace; lap 1 fixed on lap 2", () => {
    const r = buildReport(
      base({
        ex: {
          id: "hold-teardrop",
          title: "Teardrop entry",
          stage: "S4",
          allowAp: false,
          minutes: 13,
        },
        durationSec: 800,
        measured: {},
        steps: [
          {
            text: "Hold at PA",
            done: true,
            violationSec: 0,
            worst: null,
            t0: 0,
            t1: 800,
          },
        ],
        hold: hold(),
        trace: trace(800, (t) => (t > 230 && t < 240 ? 3074 : 3000)),
        events: [
          { t: 2, kind: "info", text: "Set up with help: ADF 385" },
          { t: 3, kind: "info", text: "Set up with help: BRG1 = ADF" },
        ],
      }),
    );
    expect(r.outcome).toBe("met");
    expect(r.withHelp).toBe(true);
    expect(r.help).toHaveLength(2);
    expect(r.headline).toBe("Teardrop entry, 3,000 ft held within 74 ft");
    expect(r.eyebrow).toMatch(
      /^Holding · PA · inbound 270° · right turns · 3,000 ft.* · FAA ACS IR\.III\.B$/,
    );
    const ids = r.standards.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "hold.entry",
        "hold.alt",
        "hold.inbound",
        "hold.protect",
      ]),
    );
    const inb = r.standards.find((s) => s.id === "hold.inbound")!;
    expect(inb).toMatchObject({ verdict: "met", value: "1:03" });
    expect(inb.wording).toContain("lap 1 was 0:47");
    const lap1 = r.findings.find((f) => f.standardId === "hold.inbound")!;
    expect(lap1.group).toBe("watch");
    expect(lap1.title).toBe("Lap 1 inbound 0:47, fixed on lap 2");
    // AIM 5-3-8: adjust the next outbound by the full error (0:46 + 0:13)
    expect(lap1.next).toContain("1:13".replace("1:13", "0:59"));
    // numbering: by group, then time (both watch here)
    expect(r.findings.map((f) => f.n)).toEqual(r.findings.map((_, i) => i + 1));
  });
  it("wrong entry is not met, with the AIM sectors as next time", () => {
    const r = buildReport(
      base({
        ex: {
          id: "hold-direct",
          title: "Direct entry",
          stage: "S4",
          allowAp: false,
          minutes: 12,
        },
        passed: false,
        reason: "Holding standards not met",
        measured: {},
        hold: hold({ flownEntry: "PARALLEL" }),
        durationSec: 800,
        trace: trace(800, () => 3000),
      }),
    );
    expect(r.outcome).toBe("not-met");
    expect(r.headline).toBe("Parallel entry flown, Teardrop expected");
    expect(r.findings[0].next).toMatch(/teardrop 70°/);
  });
  it("ended before the fix: the headline gives the distance to the fix", () => {
    const r = buildReport(
      base({
        endedBy: "user",
        passed: false,
        durationSec: 77,
        hold: hold({
          crossedAt: null,
          flownEntry: null,
          inboundTimes: [],
          outboundTimes: [],
        }),
        trace: trace(77, () => 3000, { lat: 45, lon: 5.96 }),
        measured: {},
      }),
    );
    expect(r.outcome).toBe("ungraded");
    expect(r.headline).toMatch(/^You stopped 1:17 in, 1\.\d NM before PA$/);
    expect(r.tiles[3].sub).toBe("PA not reached");
    expect(r.wouldGrade.length).toBe(4);
  });
});

describe("approaches (recorder ACS items)", () => {
  it("published altitudes failed: finding at the floor event, glideslope near the limit is a watch item", () => {
    const r = buildReport(
      base({
        ex: {
          id: "app-ils-hand",
          title: "ILS 27 hand-flown",
          stage: "S5",
          allowAp: false,
          minutes: 12,
          plate: "PARD-I27",
        },
        passed: false,
        reason: "ACS standards not met",
        durationSec: 670,
        measured: {},
        steps: [
          {
            text: "Fly the ILS 27",
            done: true,
            violationSec: 0,
            worst: null,
            t0: 0,
            t1: 670,
          },
        ],
        acs: {
          result: "FAIL",
          items: [
            {
              task: "Lateral guidance FAF → minimums",
              standard: "≤ ¾-scale CDI deflection (1.5 dots)",
              actual: "max 0.30 dots",
              result: "PASS",
            },
            {
              task: "Vertical guidance FAF → DA",
              standard: "≤ ¾-scale GS/GP deflection (1.5 dots)",
              actual: "max 1.10 dots",
              result: "PASS",
            },
            {
              task: "Airspeed on final",
              standard: "±10 KIAS of approach speed (90)",
              actual: "max ±6 kt",
              result: "PASS",
            },
            {
              task: "Published altitudes",
              standard:
                "No descent below a segment minimum before the fix (−100 ft)",
              actual: "44 s below",
              result: "FAIL",
            },
            {
              task: "Landing from instrument approach",
              standard: "On the runway, past the threshold, < 600 fpm",
              actual: "410 fpm, 980 ft past threshold",
              result: "PASS",
            },
          ],
        },
        events: [
          {
            t: 281,
            kind: "bad",
            text: "Descended below 2400 ft before the fix",
          },
          {
            t: 660,
            kind: "good",
            text: "Touchdown RWY 27 PARD at 410 fpm, 90 KIAS",
          },
        ],
        trace: trace(670, (t) => 3000 - t * 3, {
          vertDots: 0.4,
          latDots: 0.1,
        }).map((p) => (p.t === 550 ? { ...p, vertDots: 1.1 } : p)),
      }),
    );
    expect(r.outcome).toBe("not-met");
    expect(r.eyebrow.startsWith("Precision approach")).toBe(true);
    expect(r.taskRef).toBe("FAA ACS IR.VI.B");
    expect(r.metCount).toBe(4);
    expect(r.gradedCount).toBe(5);
    expect(r.standards[0].id).toBe("acs.pubAlt");
    expect(r.headline).toBe("Descended below 2,400 ft before the fix");
    expect(r.findings[0]).toMatchObject({ n: 1, group: "not-met", t0: 277 });
    const gs = r.findings.find((f) => f.standardId === "acs.gs")!;
    expect(gs.group).toBe("watch");
    expect(gs.title).toBe("1.1 dots on the glideslope: met, but close");
    expect(gs.tWorst).toBe(550);
    const land = r.standards.find((s) => s.id === "acs.landing")!;
    expect(land).toMatchObject({ value: "410", unit: "fpm" });
    expect(land.gauge).toMatchObject({ lo: 0, hi: 600, v: [410] });
  });
});

describe("findings: four answers and numbering", () => {
  it("every finding has where, what (with a number), why and next, plus a pin number", () => {
    const r = buildReport(
      base({
        passed: false,
        steps: [
          {
            text: "Maintain 4000 ft, heading 090, 100 KIAS for 3 min",
            done: true,
            violationSec: 30,
            worst: "Altitude -180 ft",
            t0: 0,
            t1: 190,
          },
        ],
        spans: [
          altSpan(100, 122, -180),
          {
            step: 0,
            kind: "hdg",
            t0: 130,
            t1: 140,
            text: "Heading +14°",
            worst: 14,
            tWorst: 135,
          },
        ],
      }),
    );
    for (const f of r.findings) {
      expect(f.n).toBeGreaterThan(0);
      expect(f.where.length).toBeGreaterThan(0);
      expect(f.whatHappened).toMatch(/\d/);
      expect(f.why.length).toBeGreaterThan(20);
      expect(f.next.length).toBeGreaterThan(20);
    }
  });
  it("orders by group then time", () => {
    const mk = (group: "watch" | "not-met" | "safety", t0: number) => ({
      group,
      t0,
      t1: t0 + 1,
      tWorst: t0,
      skill: "alt",
      title: "",
      where: "",
      stdChip: "",
      stdText: "",
      whatHappened: "",
      why: "",
      next: "",
    });
    const n = numberFindings([
      mk("watch", 10),
      mk("not-met", 50),
      mk("safety", 90),
      mk("not-met", 20),
    ]);
    expect(n.map((f) => [f.group, f.t0])).toEqual([
      ["safety", 90],
      ["not-met", 20],
      ["not-met", 50],
      ["watch", 10],
    ]);
  });
  it("standards: not met first, then by % of limit", () => {
    const s = (
      id: string,
      verdict: "met" | "not-met",
      pct: number | null,
      safety = false,
    ) => ({
      id,
      verdict,
      pct,
      safety,
      skill: "",
      label: id,
      wording: "",
      short: "",
      value: "",
      unit: "",
    });
    expect(
      orderStandards([
        s("a", "met", 0.2),
        s("b", "met", 0.9),
        s("c", "not-met", 1.2),
        s("d", "not-met", null, true),
      ]).map((x) => x.id),
    ).toEqual(["d", "c", "b", "a"]);
  });
});

describe("practise next", () => {
  const ctx = {
    lang: "en" as const,
    ex: { id: "bai-sl", title: "Straight and level", minutes: 4 },
    next: { id: "bai-turns", title: "Standard-rate turns", minutes: 5 },
    hold: false,
    simpler: (sk: string) =>
      SKILL_LESSON[sk]
        ? {
            id: SKILL_LESSON[sk],
            title: `Lesson ${SKILL_LESSON[sk]}`,
            minutes: 4,
          }
        : null,
  };
  it("skill map: aircraft control goes back to basic attitude flying, the glideslope to the hand-flown ILS", () => {
    expect(SKILL_LESSON.control).toBe("bai-sl");
    expect(SKILL_LESSON.gs).toBe("app-ils-hand");
  });
  it("not met: fly it again first, then the briefing, then a simpler exercise for the skill", () => {
    const r = buildReport(
      base({
        passed: false,
        steps: [
          {
            text: "Turn left to heading 270 at standard rate, maintain 4000 ft",
            done: true,
            violationSec: 30,
            worst: "Bank 35° (max 30)",
            t0: 0,
            t1: 190,
          },
        ],
        spans: [
          {
            step: 0,
            kind: "bank",
            t0: 20,
            t1: 50,
            text: "Bank 35° (max 30)",
            worst: 35,
            tWorst: 30,
          },
        ],
        measured: {},
      }),
    );
    const p = practiseNext(r, ctx);
    expect(p.items.map((i) => i.kind)).toEqual(["retry", "brief", "lesson"]);
    expect(p.items[0].primary).toBe(true);
    expect(p.items.filter((i) => i.primary)).toHaveLength(1);
    expect(p.items[2].ref).toBe("bai-turns");
    expect(p.why.lead).toBe("Bank and turn rate was not met.");
  });
  it("met: the next exercise is the primary; with help, fly it again without help comes next", () => {
    const r = buildReport(
      base({
        events: [{ t: 2, kind: "info", text: "Set up with help: NAV1 110.30" }],
      }),
    );
    const p = practiseNext(r, ctx);
    expect(p.items[0]).toMatchObject({
      kind: "next-lesson",
      ref: "bai-turns",
      primary: true,
    });
    expect(p.items[1]).toMatchObject({
      kind: "retry",
      label: "Fly it again without help",
    });
    expect(p.why.lead).toBe("Met with help.");
  });
  it("met on the last exercise: fly it again", () => {
    const p = practiseNext(buildReport(base()), { ...ctx, next: null });
    expect(p.items[0].kind).toBe("retry");
  });
  it("ended early: resume first, or by the reason given (SPEC §5.2)", () => {
    const r = buildReport(
      base({ endedBy: "user", passed: false, durationSec: 77 }),
    );
    expect(practiseNext(r, ctx).items.map((i) => i.kind)).toEqual([
      "resume",
      "restart",
    ]);
    expect(practiseNext(r, ctx).items[0].label).toBe("Resume from 1:17");
    expect(
      practiseNext(r, { ...ctx, hold: true, stopReason: "lost" }).items.map(
        (i) => i.kind,
      ),
    ).toEqual(["restart", "brief", "drill"]);
    expect(
      practiseNext(r, {
        ...ctx,
        hold: true,
        stopReason: "restart-entry",
      }).items.map((i) => i.kind),
    ).toEqual(["restart", "drill", "brief"]);
    expect(
      practiseNext(r, { ...ctx, stopReason: "broken" }).items[0].kind,
    ).toBe("restart");
  });
  it("top finding: safety, then not met by % of limit", () => {
    const f = (
      group: "watch" | "not-met" | "safety",
      pct: number,
      t0: number,
    ) => ({
      n: 0,
      group,
      pct,
      t0,
      t1: t0,
      tWorst: t0,
      skill: "",
      title: `${group}${pct}`,
      where: "",
      stdChip: "",
      stdText: "",
      whatHappened: "",
      why: "",
      next: "",
    });
    expect(
      topFinding([
        f("not-met", 1.2, 5),
        f("not-met", 1.8, 50),
        f("watch", 0.9, 1),
      ])?.title,
    ).toBe("not-met1.8");
    expect(topFinding([f("not-met", 1.8, 5), f("safety", 0, 50)])?.group).toBe(
      "safety",
    );
  });
});

describe("crash wording", () => {
  it("reads the aircraft's crash reason in both languages", async () => {
    const { crashText, eventLabel } = await import("../src/ui/result/report");
    expect(crashText("en", "Hard impact (-2506 fpm)")).toBe("Hard impact (−2,506 fpm)");
    expect(crashText("fr", "Hard impact (-2506 fpm)")).toBe("Impact violent (−2\u202f506 ft/min)");
    expect(crashText("fr", "Touched down off-airport")).toBe("Posé hors aérodrome");
    expect(eventLabel("fr", { text: "CRASH — Hard impact (-2506 fpm)" })).toBe("Accident : Impact violent (−2\u202f506 ft/min)");
    expect(eventLabel("en", { text: "CRASH — Impact with terrain" })).toBe("Accident: Impact with terrain");
    expect(eventLabel("fr", { text: "GPS captured" })).toBe("GPS capté");
  });
});

describe("French", () => {
  it("every EN key has a FR text", () => {
    const missing = Object.keys(STRINGS.en).filter((k) => !(k in STRINGS.fr));
    expect(missing).toEqual([]);
  });
  it("numbers and verdicts in French", () => {
    expect(num("fr", 2227)).toBe("2 227");
    expect(num("fr", 1.5, 1)).toBe("1,5");
    expect(tx("fr", "v.ungraded")).toBe("Non noté · arrêté avant la fin");
    const r = buildReport(
      base({ lang: "fr", endedBy: "user", passed: false, durationSec: 77 }),
    );
    expect(r.headline).toBe("Arrêté après 1:17, pendant l’étape 1 sur 1");
    expect(r.tiles[0].label).toBe("Résultat");
  });
});

describe("observer on a real run", () => {
  it("records spans and step times; an ended run becomes an ungraded input", () => {
    const sim = new Sim();
    const run = new LessonRun(exercise("bai-sl"), sim);
    const obs = new ResultObserver();
    const DT = 1 / 30;
    // push the nose down after 20 s: the altitude leaves ±100 ft
    for (let t = 0; t < 60; t += DT) {
      sim.controls.elevator = t > 20 ? 0.25 : 0;
      sim.step(DT);
      run.update(DT);
      obs.tick(run);
    }
    run.abort();
    obs.tick(run);
    expect(obs.spans.some((s) => s.kind === "alt")).toBe(true);
    const inp = inputFromRun(run, obs, {
      lang: "en",
      endedBy: "user",
      attempt: { n: 1, at: 0 },
    });
    expect(inp.trace.length).toBeGreaterThan(50);
    expect(inp.steps[0].t0).toBe(0);
    const rep = buildReport(inp);
    expect(rep.outcome).toBe("ungraded");
    expect(rep.tiles[0].value).toBe("—");
  });

  it("a hint seen before the run's first update is kept (help is shown, never graded)", () => {
    const sim = new Sim();
    const obs = new ResultObserver();
    // an earlier run leaves its own help behind
    const old = new LessonRun(exercise("bai-sl"), sim);
    obs.tick(old);
    obs.logHelp({ t: 3, kind: "hint", text: "old" }, old);
    const run = new LessonRun(exercise("bai-sl"), sim);
    obs.logHelp({ t: 0, kind: "hint", text: "Attitude + power = performance." }, run);
    run.update(1 / 30);
    obs.tick(run);
    expect(obs.help.map((x) => x.text)).toEqual(["Attitude + power = performance."]);
    run.abort();
    obs.tick(run);
    const rep = buildReport(inputFromRun(run, obs, { lang: "en", endedBy: "user", attempt: { n: 1, at: 0 } }));
    expect(rep.help.filter((x) => x.kind === "hint").length).toBe(1);
  });
});
