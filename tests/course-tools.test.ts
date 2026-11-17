// Teaching tools (course/tools): every tool is complete and draws for every value it allows, in French and in
// English; its task can be met; a tool with a task counts as the student's action; the element keeps 44 px targets.
import { describe, expect, it } from "vitest";
import {
  blockStart,
  liveControls,
  TOOLS,
  taskCheck,
  taskMet,
  toolControls,
  toolDef,
  toolTaskData,
  toolValues,
} from "../src/course/tools/index";
import { validateCourse } from "../src/course/validate";
import { allSamples } from "../src/course/samples/index";
import { esc, paramText, snapParam, toolColors, type ToolDef, type ToolValues } from "../src/course/tools/kit";
import { resolveTheme } from "../src/course/canvas/themes";
import { hasStudentAction } from "../src/course/validate";
import { toolSide, toolZoom } from "../src/course/canvas/toolBlock";
import { toolDraft, navToolDrafts } from "../src/course/canvas/factory";
import { toolSlides } from "../src/course/samples/toolSlides";
import type { L10n, Lang, Step, ToolId } from "../src/course/types";

const IDS: ToolId[] = ["wing", "loadFactor", "massBalance", "takeoff", "fuel", "carbIce", "fronts", "radioNav", "prop", "mach", "pressurisation"];
const LANGS: Lang[] = ["fr", "en"];
const c = toolColors(resolveTheme("classroom"));
const bilingual = (l: L10n | undefined, what: string) => {
  expect(l?.en, what).toBeTruthy();
  expect(l?.fr, what).toBeTruthy();
};
function drawOk(d: ToolDef, p: ToolValues, lang: Lang, what: string) {
  const v = d.draw(p, { lang, c, t: 1.3, moving: true });
  expect(v.svg.length, what).toBeGreaterThan(200);
  expect(v.svg, what).not.toMatch(/NaN|undefined|Infinity|null/);
  expect(v.readouts.length, what).toBeGreaterThanOrEqual(3);
  for (const r of v.readouts) {
    bilingual(r.label, `${what} readout`);
    expect(r.value, what).toBeTruthy();
    expect(r.value, what).not.toMatch(/NaN|undefined|Infinity/);
  }
  expect(v.say, what).toBeTruthy();
  expect(v.say, what).not.toMatch(/NaN|undefined/);
}

describe("the catalogue of teaching tools", () => {
  it("has the eleven tools, once each", () => {
    expect(TOOLS.map((t) => t.id).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(toolDef(id)?.id).toBe(id);
  });
  for (const d of TOOLS)
    describe(d.id, () => {
      it("is complete: words in both languages, values in range, presets and task on its own controls", () => {
        bilingual(d.title, "title");
        bilingual(d.blurb, "blurb");
        bilingual(d.note, "note");
        expect(d.subject).toMatch(/PPL|ATPL/);
        const keys = d.params.map((q) => q.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const q of d.params) {
          bilingual(q.label, q.key);
          for (const ch of q.choices ?? []) bilingual(ch, `${q.key} choice`);
          expect(q.min).toBeLessThan(q.max);
          const v = d.defaults[q.key];
          expect(v, q.key).toBeGreaterThanOrEqual(q.min);
          expect(v, q.key).toBeLessThanOrEqual(q.max);
        }
        expect(d.controls.length).toBeGreaterThan(0);
        for (const k of d.controls) expect(keys).toContain(k);
        expect(d.presets.length).toBeGreaterThanOrEqual(2);
        for (const pr of d.presets) {
          bilingual(pr.label, "preset");
          for (const [k, v] of Object.entries(pr.p)) {
            const q = d.params.find((x) => x.key === k);
            expect(q, `${d.id} preset ${k}`).toBeTruthy();
            expect(v).toBeGreaterThanOrEqual(q!.min);
            expect(v).toBeLessThanOrEqual(q!.max);
          }
        }
        if (d.sweep) expect(d.controls).toContain(d.sweep.key);
        if (d.task) {
          bilingual(d.task.prompt, "task");
          expect(d.controls).toContain(d.task.key);
          // from the tool's own starting values: not met before the student moves, reachable with the control's steps
          const b = { task: toolTaskData(d)!, p: { ...d.defaults } };
          expect(taskCheck(d, b)).toBe("ok");
          // its givens are real values of the tool, never offered as controls while it is on
          for (const k of Object.keys(d.task.givens ?? {})) {
            expect(d.params.some((q) => q.key === k)).toBe(true);
            expect(liveControls(d, b)).not.toContain(k);
          }
          // a hidden value names a readout the tool really has
          const keys = d.draw(toolValues(d), { lang: "fr", c, t: 0, moving: false }).readouts.map((r) => r.key);
          for (const h of d.task.hides ?? []) expect(keys).toContain(h);
        }
      });
      for (const lang of LANGS)
        it(`draws for its defaults, presets and every control at its ends (${lang})`, () => {
          drawOk(d, toolValues(d), lang, "defaults");
          for (const pr of d.presets) drawOk(d, toolValues(d, { ...d.defaults, ...pr.p }), lang, `preset ${pr.label.en}`);
          for (const q of d.params)
            for (const v of [q.min, q.max, (q.min + q.max) / 2]) {
              const p = toolValues(d, { ...d.defaults, [q.key]: snapParam(q, v) });
              drawOk(d, p, lang, `${q.key}=${v}`);
              expect(paramText(q, p[q.key], lang)).not.toMatch(/NaN|undefined/);
            }
        });
    });
});

describe("the tool block", () => {
  it("fills missing values from the defaults and drops unknown keys", () => {
    const d = toolDef("wing")!;
    const v = toolValues(d, { alpha: 99, nope: 3 } as Record<string, number>);
    expect(v.alpha).toBe(24);
    expect(v.ias).toBe(d.defaults.ias);
    expect("nope" in v).toBe(false);
    expect(toolControls(d, { controls: ["flaps", "nope"] })).toEqual(["flaps"]);
    expect(toolControls(d, {})).toEqual(d.controls);
  });
  it("keeps every target 44 CSS px: the panel zooms on a small slide", () => {
    expect(toolZoom(1)).toBe(1);
    expect(toolZoom(0.3) * 72 * 0.3).toBeGreaterThanOrEqual(44 - 1e-9);
    expect(toolZoom(0.05)).toBeLessThanOrEqual(2.2);
    expect(toolSide({ frame: { x: 0, y: 0, w: 1680, h: 736, z: 1 } })).toBe("right");
    expect(toolSide({ frame: { x: 0, y: 0, w: 900, h: 900, z: 1 } })).toBe("below");
  });
  it("a tool with a task is the student's action, a tool without one is not", () => {
    const step = (task: boolean): Step =>
      ({
        id: "s",
        kind: "slide",
        title: { en: "t", fr: "t" },
        slide: {
          size: { w: 1920, h: 1080 },
          blocks: [
            {
              id: "x",
              kind: "tool",
              tool: "wing",
              ...(task ? { task: toolTaskData(toolDef("wing")!) } : {}),
              frame: { x: 0, y: 0, w: 1680, h: 736 },
            },
          ],
        },
      }) as unknown as Step;
    expect(hasStudentAction(step(true))).toBe(true);
    expect(hasStudentAction(step(false))).toBe(false);
  });
  it("is added from the rail at the tool's size, with the drawings that were already live beside it", () => {
    for (const id of IDS) {
      const dr = toolDraft(id)!;
      expect(dr.kind).toBe("tool");
      expect(dr.frame.w).toBeGreaterThan(0);
    }
    const nav = navToolDrafts();
    expect(nav.map((n) => n.id)).toEqual(["sixty", "wind", "runwayWind"]);
    for (const n of nav) expect(n.draft.kind === "diagram" && n.draft.interactive).toBe(true);
  });
  it("one ready slide per tool in « Modèles »", () => {
    expect(toolSlides().map((s) => s.tool)).toEqual(TOOLS.map((t) => t.id));
  });
  it("escapes every text it draws", () => {
    expect(esc(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});

describe("a tool's task is checked over all its values", () => {
  const met = (id: ToolId, p: Record<string, number>, extra: object = {}) => {
    const d = toolDef(id)!;
    const b = { task: toolTaskData(d)!, ...extra };
    return taskMet(d, b, toolValues(d, { ...d.defaults, ...p }));
  };
  it("VOR: needle centred with TO from whatever radial the aircraft is on", () => {
    expect(met("radioNav", { radial: 120, obs: 300 })).toBe(true);
    // the student moved to radial 200: 020 is right, 300 is now wrong
    expect(met("radioNav", { radial: 200, obs: 20 })).toBe(true);
    expect(met("radioNav", { radial: 200, obs: 300 })).toBe(false);
    // FROM is not TO
    expect(met("radioNav", { radial: 120, obs: 120 })).toBe(false);
    // the creator starts the aircraft on radial 200: the task is still possible, and not met at the start
    const d = toolDef("radioNav")!;
    expect(taskCheck(d, { task: toolTaskData(d)!, p: { radial: 200, obs: 270, hdg: 330 } })).toBe("ok");
    expect(taskCheck(d, { task: toolTaskData(d)!, p: { radial: 200, obs: 20, hdg: 330 } })).toBe("met");
  });
  it("fuel: never below the legal minimum (taxi 5 + trip 70 + reserve 17.5 = 92.5 L)", () => {
    expect(met("fuel", { fuel: 92 })).toBe(false);
    expect(met("fuel", { fuel: 90 })).toBe(false);
    expect(met("fuel", { fuel: 93 })).toBe(true);
    expect(met("fuel", { fuel: 95 })).toBe(true);
    expect(met("fuel", { fuel: 96 })).toBe(false);
    // the prompt's figures are givens: another flow or flight time does not change the answer
    expect(met("fuel", { fuel: 93, flow: 25, trip: 60 })).toBe(true);
    const d = toolDef("fuel")!;
    const start = blockStart(d, { task: toolTaskData(d)!, p: { fuel: 150, flow: 25, trip: 60, night: 1 } });
    expect([start.flow, start.trip, start.night]).toEqual([35, 120, 0]);
    expect(liveControls(d, { task: toolTaskData(d)! })).toEqual(["fuel"]);
  });
  it("wing: flaps up is a given, the answer is the clean critical angle", () => {
    const d = toolDef("wing")!;
    const b = { task: toolTaskData(d)!, p: { flaps: 2 } };
    expect(blockStart(d, b).flaps).toBe(0);
    expect(liveControls(d, b)).not.toContain("flaps");
    expect(met("wing", { alpha: 4 })).toBe(false);
    expect(taskCheck(d, b)).toBe("ok");
  });
  it("turn: 2 g at 60° whatever the speed and weight", () => {
    expect(met("loadFactor", { bank: 60, v: 70, w: 1900 })).toBe(true);
    expect(met("loadFactor", { bank: 55 })).toBe(false);
  });
  it("Mach: FL 370 and 470 kt are givens; 32° is the least sweep", () => {
    expect(met("mach", { sweep: 32 })).toBe(true);
    expect(met("mach", { sweep: 31 })).toBe(false);
    expect(met("mach", { sweep: 35 })).toBe(false);
    expect(met("mach", { sweep: 32, alt: 5000, tas: 300 })).toBe(true);
  });
  it("a task's hidden values show only once it is met", () => {
    const d = toolDef("wing")!;
    const v = d.draw(toolValues(d), { lang: "fr", c, t: 0, moving: false, hide: new Set(["critical"]) });
    expect(v.svg).not.toMatch(/Cz max/);
    expect(d.draw(toolValues(d), { lang: "fr", c, t: 0, moving: false }).svg).toMatch(/Cz max/);
    const r = toolDef("radioNav")!;
    expect(r.draw(toolValues(r), { lang: "fr", c, t: 0, moving: false, hide: new Set(["qdm"]) }).svg).not.toMatch(/300°/);
  });
  it("the validator runs the task from the block's own starting values", () => {
    const base = structuredClone(allSamples()[0]);
    const slideStep = base.steps.find((s) => s.kind === "slide" && s.slide);
    expect(slideStep).toBeTruthy();
    const d = toolDef("radioNav")!;
    const withTool = (tool: Record<string, unknown>) => {
      const c = structuredClone(base);
      const s = c.steps.find((x) => x.id === slideStep!.id)!;
      s.slide!.blocks = [
        { id: "t1", kind: "tool", tool: "radioNav", frame: { x: 120, y: 248, w: 1680, h: 736, z: 1 }, ...tool } as never,
      ];
      return validateCourse(c).filter((i) => i.path.includes("blocks[0]"));
    };
    expect(withTool({ task: toolTaskData(d) })).toEqual([]);
    // already met at the start: a warning
    const metAtStart = withTool({ task: toolTaskData(d), p: { radial: 120, obs: 300, hdg: 300 } });
    expect(metAtStart.map((i) => i.level)).toEqual(["warn"]);
    // a creator's own target that the control cannot reach: an error
    const impossible = withTool({ task: { prompt: { en: "x", fr: "x" }, key: "hdg", target: 400, tol: 0 } });
    expect(impossible.some((i) => i.level === "error")).toBe(true);
  });
});
