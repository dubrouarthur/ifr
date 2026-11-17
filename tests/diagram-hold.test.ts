// The hold flown on a slide (stage/diagramHold.ts): what each mode names, in both languages, and the entries
// trainer — the arrival heading set with the keys or −10° / +10°, each goal heading ticked once its entry is flown.
import { beforeAll, describe, expect, it } from "vitest";
import { createCalcDiagram, hasCalcDiagram } from "../src/course/stage/diagrams";
import { goalIndex, wrapWords } from "../src/course/stage/diagramHold";
import type { CalcDiagram } from "../src/course/types";
import { DiagramHub } from "../src/course/canvas/diagramMirror";
import { installFakeSvgDom } from "./fakeSvgDom";

type Ev = { key?: string; shiftKey?: boolean; preventDefault(): void; stopPropagation(): void };
type Node0 = {
  tagName?: string;
  childNodes?: Node0[];
  getAttribute?(k: string): string | null;
  __on?: Record<string, ((e: Ev) => void)[]>;
  textContent: string;
};
const find = (n: Node0, ok: (x: Node0) => boolean): Node0 | null => {
  if (ok(n)) return n;
  for (const c of n.childNodes ?? []) {
    const r = find(c, ok);
    if (r) return r;
  }
  return null;
};
const fire = (n: Node0, type: string, e: Partial<Ev> = {}) => {
  for (const f of n.__on?.[type] ?? []) f({ preventDefault() {}, stopPropagation() {}, ...e });
};
const spec = (o: Partial<Extract<CalcDiagram, { kind: "holdFly" }>> = {}): CalcDiagram => ({
  kind: "holdFly",
  inbound: 270,
  turn: "R",
  fix: "ARD",
  tasKt: 90,
  ...o,
});

describe("the hold flown on a slide", () => {
  beforeAll(() => {
    installFakeSvgDom();
    // listeners, so the trainer's keys and buttons can be pressed
    const proto = Object.getPrototypeOf(document.createElementNS("x", "g"));
    proto.addEventListener = function (this: Node0, t: string, f: (e: Ev) => void) {
      ((this.__on ??= {})[t] ??= []).push(f);
    };
  });
  it("is drawn by the stage", () => expect(hasCalcDiagram("holdFly")).toBe(true));
  it("names the parts of the hold in the language asked", () => {
    const fr = createCalcDiagram(spec({ show: ["parts"] }), { lang: "fr", w: 1680, h: 648, u: 1 })!;
    const t = (fr.el as unknown as Node0).textContent;
    expect(t).toContain("Rapprochement · 1 min");
    expect(t).toContain("Éloignement");
    expect(t).toContain("Travers : top chrono");
    expect(t).toContain("ARD");
    const en = createCalcDiagram(spec({ show: ["parts"] }), { lang: "en", w: 1680, h: 648, u: 1 })!;
    expect((en.el as unknown as Node0).textContent).toContain("Abeam: start the clock");
  });
  it("gives the headings of the triple-drift rule in the wind", () => {
    const w = createCalcDiagram(spec({ show: ["headings"], windDir: 360, windKt: 25 }), {
      lang: "fr",
      w: 1104,
      h: 648,
      u: 1,
    })!;
    const t = (w.el as unknown as Node0).textContent;
    expect(t).toContain("Cap 286");
    expect(t).toContain("Cap 042");
    expect(t).toContain("3 × 16° = 48°");
  });
  it("lights the arrival's sector and says how to fly its entry", () => {
    const w = createCalcDiagram(spec({ show: ["sectors"], crs: 50 }), { lang: "fr", w: 1680, h: 648, u: 1, drag: ["crs"] })!;
    const t = (w.el as unknown as Node0).textContent;
    expect(t).toContain("Décalée");
    expect(t).toContain("ligne des 70°");
    expect(t).toContain("Au repère, 30°");
    expect(t).toContain("050°");
  });
  it("hides the entry until the student names it, and ticks a goal on the right answer", () => {
    const met: boolean[][] = [];
    const said: string[] = [];
    const w = createCalcDiagram(spec({ show: ["sectors"], crs: 270, goals: [50, 180, 300] }), {
      lang: "fr",
      w: 1680,
      h: 648,
      u: 1,
      drag: ["crs"],
      onGoal: (m) => met.push(m),
      announce: (t) => said.push(t),
    })!;
    const root = w.el as unknown as Node0;
    const chip = (name: string) => find(root, (n) => n.getAttribute?.("aria-label") === name)!;
    const slider = find(root, (n) => n.getAttribute?.("role") === "slider")!;
    expect(slider).toBeTruthy();
    // 270 → 180 with the arrow keys, 5° a press: nothing said, nothing ticked until the student answers
    for (let i = 0; i < 18; i++) fire(slider, "keydown", { key: "ArrowLeft" });
    expect(w.spec()).toMatchObject({ crs: 180 });
    expect(met).toEqual([]);
    expect(root.textContent).toContain("QUELLE ENTRÉE ?");
    expect(root.textContent).not.toContain("Au repère, parallèle");
    expect(slider.getAttribute!("aria-valuetext")).toBe("cap 180");
    fire(chip("Entrée parallèle"), "pointerdown");
    expect(met.at(-1)).toEqual([false, true, false]);
    expect(root.textContent).toContain("Au repère, parallèle");
    expect(slider.getAttribute!("aria-valuetext")).toBe("cap 180, entrée parallèle");
    expect(said.at(-1)).toBe("Cap 180 : entrée parallèle, objectif atteint.");
    // 180 → 300 with +10° (12 presses): asked again
    const plus = find(root, (n) => n.getAttribute?.("aria-label") === "Cap plus 10°")!;
    for (let i = 0; i < 12; i++) fire(plus, "pointerdown");
    expect(root.textContent).toContain("QUELLE ENTRÉE ?");
    fire(chip("Entrée directe"), "pointerdown");
    expect(met.at(-1)).toEqual([false, true, true]);
    // then 050 with Shift + arrows (30° a press) and −10°; a wrong answer ticks nothing and says where to look
    for (let i = 0; i < 4; i++) fire(slider, "keydown", { key: "ArrowRight", shiftKey: true });
    expect(w.spec()).toMatchObject({ crs: 60 });
    const minus = find(root, (n) => n.getAttribute?.("aria-label") === "Cap moins 10°")!;
    fire(minus, "pointerdown");
    const n0 = met.length;
    fire(chip("Entrée directe"), "pointerdown");
    expect(met.length).toBe(n0);
    expect(root.textContent).toContain("Pas celle-ci");
    expect(said.at(-1)).toContain("Pas directe");
    expect(chip("Entrée directe : pas celle-ci")).toBeTruthy();
    fire(chip("Entrée décalée"), "pointerdown");
    expect(met.at(-1)).toEqual([true, true, true]);
    expect(root.textContent).toContain("Les trois entrées sont trouvées.");
    expect(root.textContent).toContain("Cap 180 → parallèle");
    expect(said.at(-1)).toBe("Les trois entrées sont trouvées.");
  });
  it("the presenter's heading, wind, pause and answers reach the projector's copy", () => {
    const mk = () =>
      createCalcDiagram(spec({ show: ["sectors", "clock"], crs: 50 }), {
        lang: "fr",
        w: 1680,
        h: 648,
        u: 1,
        drag: ["crs"],
        onChange: () => console_.changed("fly"),
        onLive: () => console_.changed("fly"),
      })!;
    const console_ = new DiagramHub();
    const room = new DiagramHub();
    const a = mk();
    const b = createCalcDiagram(spec({ show: ["sectors", "clock"], crs: 50 }), { lang: "fr", w: 1680, h: 648, u: 1, drag: ["crs"] })!;
    console_.add("fly", { live: () => a.live!(), follow: (st) => a.follow!(st) });
    room.add("fly", { live: () => b.live!(), follow: (st) => b.follow!(st) });
    console_.on((id, st) => room.apply(id, st));
    const plus = find(a.el as unknown as Node0, (n) => n.getAttribute?.("aria-label") === "Cap plus 10°")!;
    for (let i = 0; i < 13; i++) fire(plus, "pointerdown");
    expect(a.spec()).toMatchObject({ crs: 180 });
    expect(b.spec()).toMatchObject({ crs: 180 });
    expect((b.el as unknown as Node0).textContent).toContain("Parallèle");
    // the wind turned on the console (a trainer with the wind too: the same message carries it)
    a.follow!({ ...a.live!(), spec: { ...(a.spec() as object), windDir: 360, windKt: 25 } });
    console_.changed("fly");
    expect(b.spec()).toMatchObject({ windDir: 360, windKt: 25 });
    // the projector's answers follow the console's (the trainer)
    expect(room.apply("nope", a.live!())).toBe(false);
    expect(room.snapshot().map(([id]) => id)).toEqual(["fly"]);
  });
  it("matches a goal within 5° and wraps the panel's words", () => {
    expect(goalIndex([50, 180, 300], 54)).toBe(0);
    expect(goalIndex([50, 180, 300], 56)).toBe(-1);
    expect(goalIndex([360], 3)).toBe(0);
    const lines = wrapWords("Au repère, virez dans le sens de l’attente.", 24, 300);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("Au repère, virez dans le sens de l’attente.");
  });
});
