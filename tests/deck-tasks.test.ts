// The new decks put « À vous » and questions on the slides themselves: the player must count them as tasks, so an
// end screen never says « Tous les exercices sont faits » when every one was skipped (reader.ts isTask/slideTask).
import { describe, expect, it } from "vitest";
import { DECKS } from "../src/course/samples/decks";
import { isTask, slideTask } from "../src/course/ui/reader";

describe("slide-level tasks of the decks", () => {
  for (const d of DECKS)
    it(`${d.id}: its « À vous » and questions are tasks`, () => {
      const c = d.build();
      const tasks = c.steps.filter(isTask);
      expect(tasks.length).toBeGreaterThan(0);
      for (const s of c.steps) if (slideTask(s)) expect(isTask(s), s.id).toBe(true);
      expect(c.steps.some((s) => slideTask(s) === "goal")).toBe(true);
    });
});
