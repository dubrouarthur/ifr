// Every library course and briefing: a quiz slide never shows a hold drawn with the arriving course (its entry) before
// the right answer is shown, and that drawing sits above the plain one in its frame, so it replaces it.
import { describe, expect, it } from "vitest";
import { allSamples } from "../src/course/samples";
import { CRAFTED_BRIEFINGS } from "../src/course/samples/briefings";
import type { Course, SlideBlock } from "../src/course/types";

const courses = (): Course[] => [
  ...allSamples(),
  ...CRAFTED_BRIEFINGS.map((b) => b.build()),
];

describe("hold-entry questions keep their answer", () => {
  it("the arrival's entry shows only once the answer is shown, over the sectors", () => {
    let seen = 0;
    for (const c of courses())
      for (const s of c.steps) {
        const blocks: SlideBlock[] = s.slide?.blocks ?? [];
        if (!blocks.some((b) => b.kind === "quiz")) continue;
        for (const b of blocks) {
          if (
            b.kind !== "diagram" ||
            b.d?.kind !== "hold" ||
            b.d.crs === undefined
          )
            continue;
          seen++;
          expect(b.reveal?.when, `${c.id} ${s.id} ${b.id}`).toBe("answerShown");
          const under = blocks.filter(
            (u) =>
              u !== b &&
              u.frame.x === b.frame.x &&
              u.frame.y === b.frame.y &&
              u.frame.w === b.frame.w &&
              u.frame.h === b.frame.h,
          );
          for (const u of under)
            expect(
              (u.frame.z ?? 0) < (b.frame.z ?? 0),
              `${c.id} ${s.id} ${u.id} under ${b.id}`,
            ).toBe(true);
        }
      }
    expect(seen).toBeGreaterThan(2);
  });
});

describe("a quiz's explanation says its verdict once", () => {
  it("« Juste. » is not followed by « Juste : »", async () => {
    const { withoutVerdict } = await import("../src/course/canvas/blocks");
    expect(
      withoutVerdict("Juste : la bascule marque le travers du repère.", true),
    ).toBe("La bascule marque le travers du repère.");
    expect(withoutVerdict("Right: abeam the fix.", true)).toBe(
      "Abeam the fix.",
    );
    expect(withoutVerdict("Juste : x", false)).toBe("Juste : x");
    expect(
      withoutVerdict("Non : ce secteur reçoit les caps 200 à 020.", false),
    ).toBe("Non : ce secteur reçoit les caps 200 à 020.");
    expect(withoutVerdict("Justement, le vent…", true)).toBe(
      "Justement, le vent…",
    );
  });
});
