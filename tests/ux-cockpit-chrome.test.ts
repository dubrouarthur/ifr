// Step D of the UX logic (uxlogic/UX-LOGIC.md §7): the cockpit chrome speaks the UI language. A French pilot reads
// « ← Accueil », « Vue : Extérieur », « Point 1 sur 2 », « Commencer le vol », « Résultat · Réussi » and
// « Retour au cours (étape 13) »; the English words of the "never in the UI" list do not appear in French.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setLang, t } from "../src/ui/i18n";
import { CAMERAS, cameraName, layoutName, LAYOUTS } from "../src/ui/viewDock";
import { stepLabel } from "../src/ui/lessonWindow";
import {
  scenarioName,
  scenarioKind,
  aircraftLabel,
} from "../src/ui/scenarioText";
import { SCENARIOS } from "../src/sim/sim";
import "../src/ui/courseFlight";
import "../src/ui/learn";
import { rt } from "../src/ui/result/i18n";

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
  setLang("fr");
});
afterAll(() => setLang("en"));

/** the English words that must never show in the French cockpit chrome (acceptance D) */
const NEVER_FR =
  /\b(Chase|Orbit|Tower|Fly-by|Standard|Resume|Paused|More|Flight Center|Instructor|PHASE|NEXT|MINIMUMS|WIND|New flight|Where do you depart|Real world|steam gauges|vectors to final)\b/;

describe("cockpit chrome in French", () => {
  it("names the cameras and the layouts in French", () => {
    expect(CAMERAS.map(cameraName)).toEqual([
      "Cockpit",
      "Extérieur",
      "Orbite",
      "Tour",
      "Passage",
    ]);
    const lays = LAYOUTS.map(([m]) => layoutName(m));
    expect(lays).toEqual([
      "Normale",
      "Grande vue",
      "Immersive",
      "Instruments seuls",
    ]);
    for (const w of [...lays, t("vd.viewOf", { v: cameraName("chase") })])
      expect(w).not.toMatch(NEVER_FR);
  });

  it("says « Point N sur M » in the lesson panel (never « Étape », which is the course's)", () => {
    expect(stepLabel({ step: 0, steps: 2, instruction: "", time: 0 })).toBe(
      "Point 1 sur 2",
    );
    expect(t("lw.region")).toBe("Fenêtre de la leçon");
    expect(t("lw.reduceTip")).toBe("Réduire la fenêtre de la leçon");
  });

  it("titles every built-in flight and its aircraft in French", () => {
    for (const sc of SCENARIOS) {
      expect(scenarioName(sc), sc.id).not.toMatch(NEVER_FR);
      expect(scenarioName(sc), sc.id).not.toMatch(
        /\b(RWY|Holding|departure|Free flight)\b/,
      );
      expect(scenarioKind(sc.kind)).not.toMatch(
        /^(Departure|Precision|Holding|Free flight|Non-precision)$/,
      );
    }
    expect(scenarioName(SCENARIOS.find((s) => s.id === "ils27-vtf")!)).toBe(
      "ILS piste 27 — guidage radar en finale",
    );
    expect(aircraftLabel("steam")).toBe("C172 · instruments classiques");
  });

  it("starts the flight with « Commencer le vol », and the course strip counts the course's steps", () => {
    expect(t("br.start")).toBe("Commencer le vol");
    expect(t("cf.start")).toBe("Commencer le vol");
    expect(t("cf.stepOf", { n: 13, t: 14 })).toBe("Étape 13 sur 14");
    expect(t("cf.backCourseN", { n: 13 })).toBe("Retour au cours (étape 13)");
    expect(t("cf.backingQ")).toBe("Retour au cours…");
  });

  it("the result says « Résultat », a verdict word, and « Recommencer le vol » (never « Revoler »)", () => {
    expect(rt("sheet.title")).toBe("Résultat");
    expect([rt("v.met"), rt("v.almost"), rt("v.notMet")]).toEqual([
      "Réussi",
      "Presque",
      "À retravailler",
    ]);
    expect(rt("foot.retry")).toBe("Recommencer le vol");
    expect(rt("foot.again")).toBe("Recommencer le vol");
    expect(rt("foot.debrief")).toBe("Voir le débriefing");
    expect(rt("sheet.norm", { ref: "FAA ACS IR.III.B" })).toBe(
      "Norme du test en vol : FAA ACS IR.III.B",
    );
  });
});

describe("cockpit chrome source rules", () => {
  const main = readFileSync(resolve(__dirname, "../src/main.ts"), "utf8");
  it("the top bar is « ← Accueil », the flight, « Vue », EFB, Instructeur, Pause, Plus (no bare « 1× », no hub button)", () => {
    const tb = main.slice(
      main.indexOf("const topbar = h('header'"),
      main.indexOf("syncAutoHide();\nsyncSound();"),
    );
    expect(tb).toMatch(/homeBtn,/);
    expect(tb).toMatch(/tbViews,/);
    expect(tb).not.toMatch(/rateBtn|coursesTopbarButton|class: 'brand'/);
  });
  it("the pause veil holds the one « Reprendre » (the top bar's button stays « Pause » while it shows)", () => {
    expect(main).toMatch(/const resumeHere = sim\.paused && !veil;/);
    const shell = readFileSync(
      resolve(__dirname, "../src/styles/ui-shell.css"),
      "utf8",
    );
    expect(shell).not.toMatch(/pause-veil \.pv-resume \{\s*display: none/);
  });
});
