// In flight and in the cockpit briefing, a French pilot reads French: the step instructions, the deviations, the
// set-up checklist, the exercise's briefing words and its knowledge check. The English text stays the canonical
// one (the ATC voice and the result report read it). Fails when a French deck shows English curriculum words.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { installFakeSvgDom } from "./fakeSvgDom";
import { Sim } from "../src/sim/sim";
import { EXERCISES } from "../src/train/curriculum";
import { LessonRun, stepText, violationText } from "../src/train/engine";
import { holdSetup } from "../src/train/setupAssist";
import { exerciseWords } from "../src/train/briefingText";
import { generatedBriefing } from "../src/course/ui/briefingDeck";
import { setLang } from "../src/ui/i18n";

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
  setLang("fr");
});
afterAll(() => setLang("en"));

const ex = (id: string) => EXERCISES.find((e) => e.id === id)!;

describe("in flight, in French", () => {
  it("the hold step reads French; its English text stays for the ATC voice and the report", () => {
    const run = new LessonRun(ex("hold-ndb"), new Sim());
    const st = run.rt.steps[0];
    expect(st.text).toMatch(/^Enter and fly the hold at PA/);
    expect(stepText(st)).toMatch(/^Entrez et effectuez l’attente à PA : 2 tours complets/);
  });
  it("deviations read French", () => {
    expect(violationText("Altitude +120 ft")).toBe("Altitude +120 ft");
    expect(violationText("Heading -12°")).toBe("Cap -12°");
    expect(violationText("Bank 38° (max 30)")).toBe("Inclinaison 38° (max 30)");
    expect(violationText("Stall warning")).toBe("Alarme de décrochage");
    expect(violationText("Overshot 090 by 14°")).toBe("Cap 090 dépassé de 14°");
  });
  it("the set-up checklist of a hold on an NDB reads French", () => {
    const run = new LessonRun(ex("hold-ndb"), new Sim());
    const def = run.rt.hold!;
    const labels = holdSetup(run.sim, def).map((i) => i.label);
    expect(labels).toContain("BRG1 sur ADF");
    expect(labels.some((l) => /^Entrée : (directe|décalée|parallèle)$/.test(l))).toBe(true);
    expect(labels).toContain("Chronométrer l’éloignement depuis le travers");
    expect(labels.join(" ")).not.toMatch(/Entry:|Time outbound|Slow to holding/);
  });
});

describe("the cockpit briefing deck, in French", () => {
  // English words of train/curriculum.ts that a French deck must not show
  const EN = [
    "Determine the AIM entry",
    "Inbound legs 1:00",
    "Non-holding side excursion",
    "Six Ts at the fix",
    "A 25 kt crosswind",
    "Which entry?",
    "TEARDROP",
    "Holding with a strong wind",
    "Enter and fly the hold",
  ];
  it("hold-wind: title, summary, objectives, standards, question and steps in French", () => {
    const e = ex("hold-wind");
    const run = new LessonRun(e, new Sim());
    const w = exerciseWords(e, run.rt, "fr");
    expect(w.title).toBe("Attente par vent fort");
    expect(w.quiz?.options).toEqual(["DIRECTE", "DÉCALÉE", "PARALLÈLE"]);
    const deck = generatedBriefing(
      {
        id: e.id,
        title: w.title,
        summary: w.summary,
        stage: e.stage,
        minutes: e.minutes,
        allowAp: e.allowAp,
        objectives: w.objectives,
        standards: w.standards,
        briefing: w.briefing,
        clearance: run.rt.clearance,
        ...(w.quiz ? { quiz: w.quiz } : {}),
        steps: w.steps,
      },
      "fr",
    );
    // the French side of every text block of the deck
    const fr: string[] = [];
    const walk = (x: unknown) => {
      if (!x || typeof x !== "object") return;
      const o = x as Record<string, unknown>;
      if (typeof o.fr === "string") fr.push(o.fr);
      for (const v of Object.values(o)) walk(v);
    };
    walk(deck);
    const all = fr.join("\n");
    for (const s of EN) expect(all, s).not.toContain(s);
    // the clearance stays in English phraseology
    expect(all).toContain("Hold EAST of ARD");
  });
});

describe("every simulator exercise speaks French", () => {
  it("each exercise has a French summary, objectives, standards and briefing", () => {
    for (const e of EXERCISES) {
      expect(e.fr?.summary, e.id).toBeTruthy();
      expect(e.fr?.objectives?.length, e.id).toBe(e.objectives.length);
      expect(e.fr?.standards?.length, e.id).toBe(e.standards.length);
      expect(e.fr?.briefing?.length, e.id).toBe(e.briefing.length);
    }
  });
  it("lesson 1 of LAPL · PPL (bai-sl) reads French, steps included", () => {
    const e = ex("bai-sl");
    const run = new LessonRun(e, new Sim());
    const w = exerciseWords(e, run.rt, "fr");
    const all = [w.summary, ...w.objectives, ...w.standards, ...w.briefing, ...w.steps].join("\n");
    expect(all).not.toMatch(/Hold altitude|Establish a radial scan|Heading ±|Airspeed ±|Maintain 4000/);
    expect(w.standards).toEqual(["Altitude ±100 ft", "Cap ±10°", "Vitesse ±10 KIAS"]);
  });
  it("every step of every exercise has French words", () => {
    for (const e of EXERCISES) {
      if (e.id === "hold-random") continue;
      const run = new LessonRun(e, new Sim());
      for (const s of run.rt.steps) expect(s.fr, `${e.id}: ${s.text}`).toBeTruthy();
    }
  });
});

describe("the cockpit chrome, in French (journey review)", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  it("the top bar stays docked by default: « ← Accueil », Pause and Plus are always in sight", () => {
    const src = read("src/main.ts");
    expect(src).toMatch(/store\.get\('ifr\.autohide', false\)/);
    // hidden on purpose (the opt-in in Plus), the way back is still named: icon + « Menu »
    expect(src).toMatch(/class: 'sb-menu'[^\n]*h\('span', \{\}, 'Menu'\)/);
  });
  it("the Plus menu is short: flight, help, settings, and no duplicate of the library or the debrief", () => {
    const src = read("src/main.ts");
    const menu = src.slice(src.indexOf("moreMenu.append("), src.indexOf("// ------", src.indexOf("moreMenu.append(")));
    // three groups everywhere; on a phone (≤600 px) a fourth, « Sur cet écran », holds the top bar's View / EFB /
    // Instructeur buttons that no longer fit (audit §6), and only there
    expect(menu.match(/menuHead\('/g)).toHaveLength(4);
    expect(menu).toMatch(/menuHead\('On this screen'\); x\.classList\.add\('phone-only'\)/);
    expect(menu.match(/menuHead\('(Flight|Help|Settings)'\)/g)).toHaveLength(3);
    expect(menu).not.toMatch(/'Learning paths'|'Training records'|'Library'|'Debrief'|'Direct-To'|'Procedures'/);
    expect(src).toMatch(/Help: 'Aide'/);
  });
  it("no English name is left on the pedestal, the softkeys or the EFB's own controls", () => {
    const src = read("src/main.ts");
    for (const raw of [
      "'aria-label': 'Chrono: start'",
      "'aria-label': 'Chrono reset'",
      "(not modelled)`",
      "'aria-label': 'Wheel brakes'",
      "'aria-label': 'Trim nose down'",
      "title: 'Tap for the step buttons'",
    ])
      expect(src, raw).not.toContain(raw);
    for (const k of ["'Chrono: start'", "'not modelled'", "'Heading mode (H)'", "'Tap for the step buttons'", "'Set altimeter to QNH (B)'"])
      expect(src, k).toContain(`${k}: `);
    const efb = read("src/ui/charts.ts");
    expect(efb).not.toMatch(/"aria-label": "(Close|Zoom out|Zoom in|Night mode)"/);
    // closed, the EFB drawer is inert: its controls are not announced from the cockpit
    expect(efb).toMatch(/this\.el\.inert = !o;/);
  });
  it("Accueil and Simulateur hold the cockpit: nothing is simulated or drawn behind an opaque page", () => {
    expect(read("src/main.ts")).toMatch(/if \(fc\.isOpen \|\| \(fc\.returnTo && builder\.isOpen\)\) \{/);
  });
  it("the briefing and the flight planner never call a flight's part « étape » (a course's word)", () => {
    expect(read("src/lesson/briefingDeck.ts")).not.toMatch(/fr: [`"][^`"]*[ée]tapes?\b/i);
    const fb = read("src/ui/circuitBuilder.ts");
    expect(fb).toMatch(/"fb\.tabFlights": "Route · \{n\} branches"/);
    expect(fb).not.toMatch(/name: "New flight"/);
  });
});

