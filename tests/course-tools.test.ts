// Teaching tools (course/tools): every tool is complete and draws for every value it allows, in French and in
// English; its task can be met; a tool with a task counts as the student's action; the element keeps 44 px targets.
import { describe, expect, it } from "vitest";
import { TOOLS, taskMet, toolControls, toolDef, toolValues } from "../src/course/tools/index";
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
          const q = d.params.find((x) => x.key === d.task!.key)!;
          // the target is reachable with the control's own steps
          const at = snapParam(q, d.task.target);
          expect(taskMet({ task: d.task }, { ...d.defaults, [q.key]: at })).toBe(true);
          expect(taskMet({ task: d.task }, d.defaults)).toBe(false);
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
    expect(toolSide({ frame: { x: 0, y: 0, w: 1680, h: 736 } })).toBe("right");
    expect(toolSide({ frame: { x: 0, y: 0, w: 900, h: 900 } })).toBe("below");
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
              ...(task ? { task: toolDef("wing")!.task } : {}),
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
