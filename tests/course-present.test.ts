import { describe, expect, it } from "vitest";
import {
  clockText,
  isPresentWire,
  pace,
  presentLink,
  PRESENT_CHANNEL,
} from "../src/course/present";
import { academyHash, academyRoute } from "../src/course/ui/library";

/** an in-memory BroadcastChannel pair (two windows of one browser) */
function bus() {
  const subs = new Set<(e: MessageEvent) => void>();
  const make = (name: string) => {
    expect(name).toBe(PRESENT_CHANNEL);
    const mine = new Set<(e: MessageEvent) => void>();
    const ch = {
      postMessage(data: unknown) {
        for (const f of subs) if (!mine.has(f)) f({ data } as MessageEvent);
      },
      addEventListener(_t: string, f: (e: MessageEvent) => void) {
        mine.add(f);
        subs.add(f);
      },
      removeEventListener(_t: string, f: (e: MessageEvent) => void) {
        mine.delete(f);
        subs.delete(f);
      },
      close() {},
    };
    return ch as unknown as BroadcastChannel;
  };
  return make;
}

describe("presenter ↔ projector wire", () => {
  it("delivers a course's messages to the other window only", () => {
    const make = bus();
    const console1 = presentLink("c1", make);
    const projector = presentLink("c1", make);
    const otherCourse = presentLink("c2", make);
    const got: unknown[] = [];
    const leaked: unknown[] = [];
    projector.on((m) => got.push(m));
    otherCourse.on((m) => leaked.push(m));
    console1.post({ t: "goto", stepId: "s3", reveal: 2 });
    console1.post({ t: "black", on: true });
    expect(got).toEqual([
      { t: "goto", stepId: "s3", reveal: 2 },
      { t: "black", on: true },
    ]);
    expect(leaked).toEqual([]);
    expect(console1.ok).toBe(true);
  });
  it("works without BroadcastChannel (the console still presents)", () => {
    const l = presentLink("c1", () => null);
    expect(l.ok).toBe(false);
    expect(() => l.post({ t: "bye" })).not.toThrow();
  });
  it("only accepts known message kinds", () => {
    expect(isPresentWire({ t: "goto", stepId: "a", reveal: 0 })).toBe(true);
    expect(isPresentWire({ t: "hello", courseId: "x" })).toBe(true);
    expect(isPresentWire({ t: "eval", code: "alert(1)" })).toBe(false);
    expect(isPresentWire(null)).toBe(false);
  });
  it("formats the timer and the pace", () => {
    expect(clockText(0)).toBe("0:00");
    expect(clockText(65.9)).toBe("1:05");
    expect(clockText(3725)).toBe("1:02:05");
    expect(pace(30 * 60, 30)).toBe("ok");
    expect(pace(40 * 60, 30)).toBe("late");
    expect(pace(10 * 60, 30)).toBe("ahead");
  });
  it("routes #present / #project / #edit with a step", () => {
    expect(academyRoute("#present=sample-vor&s=v-hsi")).toEqual({
      k: "present",
      id: "sample-vor",
      s: "v-hsi",
    });
    expect(academyRoute("#project=sample-vor")).toEqual({
      k: "project",
      id: "sample-vor",
    });
    expect(academyHash({ k: "edit", id: "my", s: "s2" })).toBe("#edit=my&s=s2");
    expect(academyRoute(academyHash({ k: "edit", id: "my", s: "s2" }))).toEqual(
      { k: "edit", id: "my", s: "s2" },
    );
  });
});
