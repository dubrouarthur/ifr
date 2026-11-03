import { describe, it, expect } from "vitest";
import { Recorder, computeDebrief, type Sample } from "../src/sim/recorder";

const sample = (
  t: number,
  phase: Sample["phase"],
  o: Partial<Sample> = {},
): Sample => ({
  t,
  lat: 0,
  lon: 0,
  alt: 1000,
  agl: 600,
  ias: 90,
  vs: -500,
  hdg: 270,
  bank: 0,
  pitch: 0,
  latDots: 0.1,
  vertDots: 0.1,
  ap: false,
  phase,
  visual: false,
  mins: 470,
  ...o,
});

describe("debrief grading (ui-windows)", () => {
  it("does not grade an empty or aborted flight", () => {
    const r = new Recorder();
    const db = computeDebrief(r, null);
    expect(db.graded).toBe(false);
    expect(db.headline).toBe("Not enough flight to grade");
    // no approach flown and none loaded: no "not flown" row pretending to be a pass
    expect(
      db.items.some(
        (i) => i.penalty === 0 && !i.na && /not flown/.test(i.value),
      ),
    ).toBe(false);
  });

  it("a short enroute flight without approach, touchdown or missed approach stays ungraded", () => {
    const r = new Recorder();
    for (let i = 0; i < 120; i++) r.samples.push(sample(i * 0.5, "enroute"));
    expect(computeDebrief(r, null).graded).toBe(false);
  });

  it('grades a flown final segment; "checkride standard" only for a passed checkride', () => {
    const r = new Recorder();
    for (let i = 0; i < 60; i++) r.samples.push(sample(i * 0.5, "final"));
    const db = computeDebrief(r, 470);
    expect(db.graded).toBe(true);
    expect(db.grade).toBe("A");
    expect(db.headline).not.toMatch(/Checkride/);
  });

  it("a crash is graded F", () => {
    const r = new Recorder();
    r.crashed = "CFIT";
    const db = computeDebrief(r, null);
    expect(db.graded).toBe(true);
    expect(db.grade).toBe("F");
  });

  it("each flight gets its own record id (reset at start)", async () => {
    const r = new Recorder();
    const a = r.startedAt;
    await new Promise((res) => setTimeout(res, 5));
    r.reset();
    expect(r.startedAt).not.toBe(a);
    expect(r.lesson).toBeNull();
  });
});
