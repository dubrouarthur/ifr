// The hold flown by a point mass for the animated hold diagram (stage/holdPath.ts): each entry ends established on
// the inbound course, the stopwatch starts abeam the fix, the triple-drift rule keeps the racetrack in a crosswind,
// and the outbound time found for 1:00 inbound shortens into a headwind outbound.
import { describe, expect, it } from "vitest";
import { autoOutbound, flyHold, sampleAt, windCorrection } from "../src/course/stage/holdPath";

const I = 270;
// NM across the inbound course (+ holding side, right turns) and along it (+ past the fix)
const frame = (x: number, y: number) => {
  const ux = Math.sin((I * Math.PI) / 180);
  const uy = Math.cos((I * Math.PI) / 180);
  return { along: x * ux + y * uy, cross: x * uy - y * ux };
};

describe("flyHold", () => {
  it.each([
    [270, "DIRECT"],
    [300, "DIRECT"],
    [50, "TEARDROP"],
    [180, "PARALLEL"],
    [150, "PARALLEL"],
  ])("arriving on %i°: the %s entry, then laps of about 1:00 inbound, on the course", (crs, entry) => {
    const f = flyHold({ inbound: I, turn: "R", crs, tasKt: 90, laps: 2 });
    expect(f.entry).toBe(entry);
    expect(f.inboundS.length).toBe(2);
    for (const s of f.inboundS) expect(Math.abs(s - 60)).toBeLessThan(12);
    // every crossing of the fix after the entry is on the course
    const end = f.samples.at(-1)!;
    expect(Math.abs(frame(end.x, end.y).cross)).toBeLessThan(0.08);
    // the racetrack is on the holding side, east of the fix
    const out = f.samples.filter((s) => s.phase === "outbound" && s.lap >= 1);
    for (const s of out) {
      const p = frame(s.x, s.y);
      expect(p.cross).toBeGreaterThan(0.5);
      expect(p.along).toBeLessThan(0.3);
    }
  });
  it("starts the stopwatch abeam the fix", () => {
    const f = flyHold({ inbound: I, turn: "R", tasKt: 90, laps: 1 });
    expect(f.abeam.length).toBe(1);
    expect(Math.abs(frame(f.abeam[0].x, f.abeam[0].y).along)).toBeLessThan(0.03);
    const first = f.samples.find((s) => s.clock?.leg === "out")!;
    expect(first.phase).toBe("outbound");
  });
  it("a teardrop flies 30° off the outbound course for 1:00 from the fix", () => {
    const f = flyHold({ inbound: I, turn: "R", crs: 50, tasKt: 90, laps: 1 });
    const entry = f.samples.filter((s) => s.phase === "entry" && s.clock);
    expect(Math.max(...entry.map((s) => s.clock!.s))).toBeGreaterThanOrEqual(59.5);
    expect(Math.round(entry.at(-1)!.hdg)).toBe(60);
  });
  it("the parallel entry goes out on the non-holding side and comes back through more than 180°", () => {
    const f = flyHold({ inbound: I, turn: "R", crs: 180, tasKt: 90, laps: 1 });
    const entry = f.samples.filter((s) => s.phase === "entry");
    expect(Math.min(...entry.map((s) => frame(s.x, s.y).cross))).toBeLessThan(-0.3);
  });
  it("triple drift keeps the turn inbound near the course in a crosswind; one drift lets it drift across", () => {
    const w = { windDir: 360, windKt: 25 };
    const miss = (k: number) => {
      const f = flyHold({ inbound: I, turn: "R", tasKt: 90, laps: 1, outFactor: k, ...w });
      const s = f.samples.find((x) => x.phase === "inbound" && x.lap === 1)!;
      return frame(s.x, s.y).cross;
    };
    expect(Math.abs(miss(3))).toBeLessThan(Math.abs(miss(1)));
    expect(Math.abs(miss(3))).toBeLessThan(0.25);
    expect(flyHold({ inbound: I, turn: "R", tasKt: 90, ...w }).outHdg).toBe(42);
    expect(Math.round(windCorrection(270, 90, 360, 25))).toBe(16);
  });
  it("shortens the outbound leg with a headwind inbound, lengthens it with a tailwind inbound", () => {
    const headIn = autoOutbound({ inbound: I, turn: "R", tasKt: 90, windDir: 270, windKt: 20 });
    const tailIn = autoOutbound({ inbound: I, turn: "R", tasKt: 90, windDir: 90, windKt: 20 });
    expect(headIn).toBeLessThan(60);
    expect(tailIn).toBeGreaterThan(60);
    // and it does give about 1:00 inbound
    const f = flyHold({ inbound: I, turn: "R", tasKt: 90, windDir: 270, windKt: 20, outS: "auto", laps: 1 });
    expect(Math.abs(f.inboundS[0] - 60)).toBeLessThan(5);
  });
  it("is deterministic and interpolates samples", () => {
    const a = flyHold({ inbound: I, turn: "L", crs: 120, tasKt: 90 });
    const b = flyHold({ inbound: I, turn: "L", crs: 120, tasKt: 90 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const m = sampleAt(a, 10.25);
    expect(m.t).toBe(10.25);
  });
});
