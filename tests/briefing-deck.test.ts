// The cockpit briefing decks generated from the exercises (lesson/briefingDeck.ts, SPEC slides v2 §11): for EVERY
// exercise of the curriculum, the deck is a valid Course with shape 'briefing', passes the readability guard in
// French and in English (text ≥ 24 logical px, nothing overflowing, off the canvas or overlapping, diagram labels
// clear), has at least five slides, shows one key visual (a live instrument or a diagram) after the cover, and ends
// on "Ready to fly". The runtime of the attempt (steps, clearance, quiz, hold, set-up items) comes from a real
// LessonRun, as in the cockpit.
import { beforeAll, describe, expect, it } from "vitest";
import { installFakeSvgDom } from "./fakeSvgDom";
import { Sim } from "../src/sim/sim";
import { EXERCISES } from "../src/train/curriculum";
import { LessonRun } from "../src/train/engine";
import {
  briefingKind,
  buildBriefingDeck,
  standardNumber,
  type BriefingRuntime,
} from "../src/lesson/briefingDeck";
import { briefingDeck } from "../src/course/ui/briefingDeck";
import { validateCourse } from "../src/course/validate";
import { resolveTheme } from "../src/course/canvas/themes";
import {
  READ_FAILS,
  readIssueText,
  slideReadability,
} from "../src/course/canvas/readability";
import type { Lang } from "../src/course/types";

const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  installFakeSvgDom();
});

/** the runtime the cockpit briefs: a real LessonRun on a fresh sim */
function runtimeOf(ex: (typeof EXERCISES)[number]): BriefingRuntime {
  const run = new LessonRun(ex, new Sim());
  const st = run.rt.steps[0];
  const setup = st?.setup
    ? st.setup(run.ctx(0)).map((i) => ({
        label: i.label,
        ...(i.detail ? { detail: i.detail } : {}),
        ok: i.ok,
        ...(i.action ? { action: i.action.label } : {}),
      }))
    : [];
  const rt = run.rt;
  return {
    steps: rt.steps.map((s) => s.text),
    ...(rt.clearance ? { clearance: rt.clearance } : {}),
    ...(rt.quiz
      ? {
          quiz: {
            question: rt.quiz.question,
            options: rt.quiz.options,
            answer: rt.quiz.answer,
            explain: rt.quiz.explain,
          },
        }
      : {}),
    ...(rt.hold
      ? {
          hold: {
            inbound: rt.hold.inbound,
            turn: rt.hold.turn,
            fix: rt.hold.fix.ident,
            legMin: rt.hold.legMin,
            altFt: rt.hold.altFt,
          },
        }
      : {}),
    setup,
  };
}

const LANGS: Lang[] = ["fr", "en"];
const theme = resolveTheme("cockpit");

describe("generated briefing deck: every exercise of the curriculum", () => {
  for (const ex of EXERCISES)
    it(ex.id, () => {
      const rt = runtimeOf(ex);
      for (const lang of LANGS) {
        const c = buildBriefingDeck(ex, lang, rt);
        // a valid course with shape 'briefing'
        expect(c.shape).toBe("briefing");
        expect(c.briefingFor?.exerciseId).toBe(ex.id);
        const errors = validateCourse(c).filter((i) => i.level === "error");
        expect(errors.map((i) => `${i.path}: ${i.message.en}`)).toEqual([]);
        // ≥ 5 slides, cover first, Ready last
        const slides = c.steps.filter((s) => s.slide);
        expect(slides.length).toBe(c.steps.length);
        expect(slides.length).toBeGreaterThanOrEqual(5);
        expect(slides[0].id).toBe("b-cover");
        expect(slides[slides.length - 1].slide!.layout).toBe("ready");
        // one key visual after the cover: a live instrument or a diagram
        const visuals = slides
          .slice(1)
          .flatMap((s) => s.slide!.blocks)
          .filter((b) => b.kind === "instrument" || b.kind === "diagram");
        expect(visuals.length).toBeGreaterThan(0);
        // every instrument names a scene of the course
        for (const s of slides)
          for (const b of s.slide!.blocks)
            if (b.kind === "instrument")
              expect(c.scenes[b.scene ?? ""]).toBeTruthy();
        // the readability guard (SPEC §13)
        const fails: string[] = [];
        for (const s of slides)
          for (const i of slideReadability(s.slide!, { theme, lang }))
            if (READ_FAILS.has(i.kind))
              fails.push(
                `${s.id}/${i.blockId}${i.otherId ? `×${i.otherId}` : ""}: ${readIssueText(i, "en").en}${i.what ? ` (${i.what})` : ""}`,
              );
        expect(fails).toEqual([]);
        // unique block ids on every slide
        for (const s of slides) {
          const ids = s.slide!.blocks.map((b) => b.id);
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    });

  it("the key visual matches the exercise", () => {
    const visualOf = (id: string) => {
      const ex = EXERCISES.find((e) => e.id === id)!;
      const c = buildBriefingDeck(ex, "en", runtimeOf(ex));
      const s = c.steps.find((x) => x.id === "b-concept" || x.id === "b-hold");
      const b = s?.slide?.blocks.find(
        (x) => x.kind === "instrument" || x.kind === "diagram",
      );
      if (!b) return "none";
      if (b.kind === "instrument")
        return b.view.kind === "gauge" ? b.view.gauge : b.view.kind;
      return b.kind === "diagram" && b.d
        ? b.d.kind === "calc"
          ? b.d.calc.kind
          : b.d.kind
        : "none";
    };
    expect(visualOf("bai-turns")).toBe("tc");
    expect(visualOf("bai-unusual")).toBe("ai");
    expect(visualOf("nav-vor-out")).toBe("hsi");
    expect(visualOf("nav-vor-in")).toBe("windTriangle");
    expect(visualOf("nav-ndb")).toBe("rmi");
    expect(visualOf("int-loc30")).toBe("hsi");
    expect(visualOf("hold-direct")).toBe("hold");
    expect(visualOf("app-ils-hand")).toBe("profile");
    expect(visualOf("pp-unusual")).toBe("six");
    expect(
      briefingKind({ id: "app-loc", stage: "S5", plate: "PARD-I27" }),
    ).toBe("approach");
  });

  it("standards become big numbers, sentences stay sentences", () => {
    expect(standardNumber("Altitude ±100 ft")).toEqual({
      value: "±100 ft",
      label: "Altitude",
    });
    expect(standardNumber("Bank 45° ±5°")).toEqual({
      value: "±5°",
      label: "Bank 45°",
    });
    expect(standardNumber("Non-holding side excursion < 0.6 NM")?.value).toBe(
      "< 0.6 NM",
    );
    expect(standardNumber("Correct entry procedure")).toBeNull();
    expect(
      standardNumber(
        "ACS: altitude ±100 ft, heading ±10°, airspeed ±10 KIAS, ¾-scale on final, DA discipline",
      ),
    ).toBeNull();
  });

  it("the set-up slide says what the Set it buttons do", () => {
    const ex = EXERCISES.find((e) => e.id === "app-ils-hand")!;
    const rt = runtimeOf(ex);
    expect(rt.setup?.length ?? 0).toBeGreaterThan(0);
    const c = buildBriefingDeck(ex, "fr", rt);
    const s = c.steps.find((x) => x.id.startsWith("b-setup"));
    expect(s).toBeTruthy();
    if (rt.setup!.some((i) => i.action))
      expect(
        s!.slide!.blocks.some(
          (b) => b.kind === "text" && /Bouton/.test(b.text.fr ?? ""),
        ),
      ).toBe(true);
  });

  it("a school's own deck wins, and still ends on Ready to fly", () => {
    const ex = EXERCISES.find((e) => e.id === "hold-ndb")!;
    const rt = runtimeOf(ex);
    const d = briefingDeck(
      {
        id: ex.id,
        stage: ex.stage,
        title: ex.title,
        summary: ex.summary,
        minutes: ex.minutes,
        allowAp: ex.allowAp,
        objectives: ex.objectives,
        standards: ex.standards,
        briefing: ex.briefing,
        steps: rt.steps,
      },
      "fr",
    );
    expect(d.authored).toBe(true);
    expect(d.slides[d.slides.length - 1].slide.layout).toBe("ready");
    // an exercise no school wrote a deck for: the generated deck (a stage 1 exercise: the six-pack, one scene)
    const g = briefingDeck(
      {
        id: "not-a-lesson",
        stage: "S1",
        title: "T",
        summary: "S",
        minutes: 5,
        allowAp: false,
        objectives: ["a"],
        standards: ["Altitude ±100 ft"],
        briefing: ["b"],
        steps: ["x", "y"],
      },
      "en",
    );
    expect(g.authored).toBe(false);
    expect(Object.keys(g.scenes).length).toBe(1);
  });
});
