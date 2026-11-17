// Audit lane A, part 2: end of a casual flight, quick-flight briefings, the library's search and filters, the player.
import { describe, expect, it } from "vitest";
import { endsLight, trackPoints } from "../src/ui/result/flightDone";

describe("§28 a flight outside a course ends on one short card", () => {
  it("only a free, ungraded flight gets the light card", () => {
    expect(endsLight({ fromCourse: false, exercise: false, graded: false })).toBe(true);
    expect(endsLight({ fromCourse: true, exercise: false, graded: false })).toBe(false);
    expect(endsLight({ fromCourse: false, exercise: true, graded: false })).toBe(false);
    expect(endsLight({ fromCourse: false, exercise: false, graded: true })).toBe(false);
  });
  it("draws the track north up, inside its box, at one scale", () => {
    const pts = trackPoints(
      [
        { lat: 43.0, lon: 5.0 },
        { lat: 43.1, lon: 5.0 },
        { lat: 43.1, lon: 5.2 },
      ],
      280,
      140,
    );
    const xy = pts.split(" ").map((p) => p.split(",").map(Number));
    expect(xy).toHaveLength(3);
    for (const [x, y] of xy) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(280);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(140);
    }
    // going north moves up the picture, going east moves right
    expect(xy[1][1]).toBeLessThan(xy[0][1]);
    expect(xy[2][0]).toBeGreaterThan(xy[1][0]);
  });
  it("draws nothing under two points", () => {
    expect(trackPoints([{ lat: 1, lon: 1 }], 100, 100)).toBe("");
    expect(trackPoints([], 100, 100)).toBe("");
  });
});

import { howToFlyLines } from "../src/ui/howToFly";
describe("§25 / §31 « Comment piloter » says how to fly, pause and finish on this device", () => {
  it("keyboard and mouse: the arrows, power, Esc, the flight's name", () => {
    const [fly, pause, end] = howToFlyLines(true, false);
    expect(fly).toMatch(/Au clavier/);
    expect(fly).toMatch(/souris/);
    expect(pause).toMatch(/Échap/);
    expect(end).toMatch(/cliquez.*Terminer et débriefer/);
  });
  it("a finger: the yoke and the throttle, the pause button, no keyboard words", () => {
    const lines = howToFlyLines(true, true);
    expect(lines.join(" ")).not.toMatch(/clavier|Échap|cliquez/);
    expect(lines[0]).toMatch(/manche/);
    expect(lines[2]).toMatch(/touchez/);
  });
  it("English says it in English, with English quotes", () => {
    const en = howToFlyLines(false, false).join(" ");
    expect(en).not.toMatch(/[«»]/);
    expect(en).toMatch(/“End and debrief”/);
  });
});

import { lastFlyHandoff, leftUnfinished, lastLeftFlight, leftFlightLine } from "../src/course/ui/flyLeft";
import type { AttemptRecord, Handoff } from "../src/course/types";
describe("§45 a flight left early still says so when the course is opened again without its token", () => {
  const hd = (token: string, stepId: string, created: string, consumed?: string) =>
    ({ token, courseId: "c", rev: 1, stepId, target: { kind: "scene" }, options: [], criteria: [], returnUrl: "", created, ...(consumed ? { consumed } : {}) }) as unknown as Handoff;
  const att = (at: string) => ({ courseId: "c", rev: 1, stepId: "s", profileId: "p", at, secs: 1, kind: "fly" }) as AttemptRecord;
  const all = [
    hd("a", "s", "2026-11-01T10:00:00Z", "2026-11-01T10:00:05Z"),
    hd("b", "s", "2026-11-02T10:00:00Z", "2026-11-02T10:00:05Z"),
    hd("c", "other", "2026-11-03T10:00:00Z", "2026-11-03T10:00:05Z"),
  ];
  it("picks the newest flight of this step", () => {
    expect(lastFlyHandoff(all, "c", "s")?.token).toBe("b");
    expect(lastFlyHandoff(all, "c", "none")).toBeNull();
  });
  it("opened in the cockpit, no attempt since: not finished", () => {
    expect(leftUnfinished(all[1], null)).toBe(true);
    expect(leftUnfinished(all[1], att("2026-11-01T10:05:00Z"))).toBe(true);
  });
  it("an attempt after it, or a link never opened: nothing to say", () => {
    expect(leftUnfinished(all[1], att("2026-11-02T10:09:00Z"))).toBe(false);
    expect(leftUnfinished(hd("d", "s", "2026-11-04T10:00:00Z"), null)).toBe(false);
  });
  it("the slide's line: when it stopped, no result, and the way to fly it again", () => {
    const stopped = { ...att("2026-11-02T10:09:00Z"), fly: { ungraded: true, passed: false } } as unknown as AttemptRecord;
    expect(lastLeftFlight(all[1], [stopped])).toEqual({ at: "2026-11-02T10:09:00Z", secs: 1 });
    expect(lastLeftFlight(all[1], [])).toEqual({ at: "2026-11-02T10:00:05Z" });
    expect(lastLeftFlight(null, [att("2026-11-02T10:09:00Z")])).toBeNull();
    expect(leftFlightLine({ at: "x", secs: 170 }, "Voler dans le simulateur", "fr")).toBe(
      "Vol interrompu à 2:50 · pas de résultat. « Voler dans le simulateur » pour revoler.",
    );
    expect(leftFlightLine({ at: "x" }, "Fly it in the simulator", "en")).toBe(
      "Flight stopped · no result. “Fly it in the simulator” to fly it again.",
    );
  });
});

import { goalRowsLive } from "../src/course/ui/player";
describe("§47 the goal rows wait for « Prendre les commandes »", () => {
  it("neutral under the « À vous » card and during a Show me demo", () => {
    expect(goalRowsLive(true, "briefed")).toBe(false);
    expect(goalRowsLive(true, "demo")).toBe(false);
  });
  it("live once the student has the controls, and on a step without a hand-over", () => {
    expect(goalRowsLive(true, "inControl")).toBe(true);
    expect(goalRowsLive(false, "idle")).toBe(true);
  });
});

import { presentGroups } from "../src/library/model";
import { subjectsOf } from "../src/library/programs";
import type { LibItem } from "../src/library/model";
describe("§54 « Présenter à une classe »: by formation, then subject, the last browsed first", () => {
  const it_ = (key: string, home: string, order: number) =>
    ({ key, kind: "course", home, also: [], title: { en: key, fr: key }, order, open: { k: "course", id: key } }) as unknown as LibItem;
  const [p1, p2] = subjectsOf("ppl").map((s) => s.id);
  const [i1] = subjectsOf("ir").map((s) => s.id);
  const items = [
    it_("ir-a", i1, 1),
    it_("ppl-b", p2, 2),
    it_("ppl-a", p1, 1),
    { ...it_("chk", p1, 3), kind: "proc" } as LibItem,
  ];
  it("only courses, grouped, syllabus order", () => {
    const g = presentGroups(items);
    expect(g.map((x) => x.program)).toEqual(["ppl", "ir"]);
    expect(g[0].subjects.map((s) => s.subject)).toEqual([p1, p2]);
    expect(g.flatMap((x) => x.subjects.flatMap((s) => s.items.map((i) => i.key)))).not.toContain("chk");
  });
  it("the formation last browsed comes first", () => {
    expect(presentGroups(items, "ir").map((x) => x.program)).toEqual(["ir", "ppl"]);
  });
});

import { TEMPLATES } from "../src/train/circuits";
describe("§57 « Préparer un vol » starts with a VFR flight", () => {
  it("the first template is VFR, built at Mistral Valley in clear weather, with no procedure", () => {
    const t = TEMPLATES[0];
    expect(t.rules).toBe("vfr");
    const c = t.build({})!;
    expect(c).toBeTruthy();
    expect(c.start.type).toBe("runway");
    expect(c.dep).toBe("MSVL");
    expect(c.weather.ceilingFt).toBeGreaterThanOrEqual(10000);
    expect(c.legs.some((l) => l.type === "approach" || l.type === "sid" || l.type === "star")).toBe(false);
  });
  it("the IFR templates follow it", () => {
    expect(TEMPLATES.slice(1).every((t) => t.rules !== "vfr")).toBe(true);
  });
});

import { basicInstrumentsCourse as bic } from "../src/course/samples/decks/basicInstruments";
describe("§46 an EASA PPL course cites the EASA programme first, FAA as « voir aussi »", () => {
  it("every footer source of « Les instruments de base » starts with the EASA PPL(A) programme", () => {
    const text = JSON.stringify(bic());
    expect(text).toMatch(/Programme EASA PPL\(A\) · voir aussi FAA/);
    expect(text).not.toMatch(/"fr":"FAA [^"]*"/);
  });
});

import { allSamples } from "../src/course/samples";
describe("§22 the PPL courses a school presents first have notes on every slide", () => {
  for (const id of [
    "sample-deck-basic-instruments",
    "sample-deck-standard-turn-scan",
    "sample-lib-ppl-human-performance",
    "sample-lib-ppl-flight-manoeuvres",
  ])
    it(id, () => {
      const c = allSamples().find((x) => x.id === id)!;
      expect(c).toBeTruthy();
      const missing = c.steps.filter((s) => !s.notes?.fr || !s.notes?.en).map((s) => s.id);
      expect(missing).toEqual([]);
    });
});
