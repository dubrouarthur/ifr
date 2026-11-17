// Taking the controls (course/handover.ts): the one vocabulary, the texts derived from a step's data, the state
// machine (idle → briefed → in control → done / handed back / retry, with the Show me detour) and the keyboard map.
// The DOM (stage/handoverLayer.ts) is exercised in the browser by the Playwright walk.
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONTROL_ORDER,
  HANDOVER_WORDS,
  barePrompt,
  controlHow,
  controlKeys,
  controlName,
  deriveBrief,
  deriveResult,
  detectDevice,
  handoverAnnounce,
  handoverNext,
  handoverRuns,
  hw,
  hwq,
  keyAction,
  orderControls,
  type HandoverEvent,
  type HandoverState,
} from "../src/course/handover";
import { RETIRED_HANDOVER_WORDS } from "../src/course/handoverWords";
import { controlSpecs } from "../src/course/stage/controls";
import { t as stageT } from "../src/course/stage/strings";
import { tx } from "../src/course/canvas/strings";
import { ct } from "../src/course/i18n";
import type { StageControl, StepGoal, YourTurn } from "../src/course/types";

const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  };
});

const GOAL: StepGoal = {
  all: [
    { id: "track", p: { value: 40, tol: 3 } },
    { id: "vsBand", p: { min: -650, max: -350 } },
  ],
  holdS: 10,
  graded: false,
};

describe("the one vocabulary", () => {
  it("has exactly the eight phrases, in both languages", () => {
    expect(HANDOVER_WORDS).toEqual({
      yourTurn: ["Your turn", "À vous"],
      take: ["Take the controls", "Prendre les commandes"],
      youHave: ["You have the controls", "Vous avez les commandes"],
      showMe: ["Show me", "Montrez-moi"],
      handBack: ["Hand back the controls", "Rendre les commandes"],
      tryAgain: ["Try again", "Réessayer"],
      flyInSim: ["Fly it in the simulator", "Voler dans le simulateur"],
      backToCourse: ["Back to the course", "Reprendre le cours"],
    });
    expect(hw("take", "fr")).toBe("Prendre les commandes");
    expect(hwq("backToCourse", "fr")).toBe("« Reprendre le cours »");
    expect(hwq("backToCourse", "en")).toBe("“Back to the course”");
  });

  it("is what every string table says", async () => {
    // the slide's instrument button and its simulator variant
    expect([tx("yourTurn", "fr"), tx("yourTurn", "en")]).toEqual([
      "À vous",
      "Your turn",
    ]);
    expect([tx("openSim", "fr"), tx("openSim", "en")]).toEqual([
      "Voler dans le simulateur",
      "Fly it in the simulator",
    ]);
    // the clip bar's take-over
    expect([stageT("takeOver", "fr"), stageT("takeOver", "en")]).toEqual([
      "Prendre les commandes",
      "Take the controls",
    ]);
    // the Your turn opened over a slide: its chip and its way back
    expect(ct("yourTurn", "fr")).toBe("À vous");
    expect(ct("backToSlide", "fr")).toBe("Reprendre le cours");
    expect(ct("backToSlide", "en")).toBe("Back to the course");
    // the player: Show me, Fly it
    const { ps } = await import("../src/course/ui/reader");
    expect([ps("showMe", "fr"), ps("showMe", "en")]).toEqual([
      "Montrez-moi",
      "Show me",
    ]);
    expect(ps("flyIt", "fr")).toBe("Voler dans le simulateur");
    expect(ps("flyGoNote", "fr")).toContain("« Reprendre le cours »");
    // the cockpit: the card's one filled button and the strip's way back
    const { setLang, t } = await import("../src/ui/i18n");
    await import("../src/ui/courseFlight");
    setLang("fr");
    expect(t("cf.start")).toBe("Prendre les commandes");
    expect(t("cf.backCourse")).toBe("Reprendre le cours");
    expect(t("cf.backCourseN", { n: 3 })).toBe("Reprendre le cours (diapo 3)");
    expect(t("cf.briefK")).toContain("À vous");
    setLang("en");
    expect(t("cf.start")).toBe("Take the controls");
    expect(t("cf.backCourse")).toBe("Back to the course");
  });

  it("no hand-over string table says it another way", () => {
    const files = [
      "src/course/canvas/strings.ts",
      "src/course/stage/strings.ts",
      "src/course/stage/handoverLayer.ts",
      "src/course/stage/controls.ts",
      "src/course/stage/frame.ts",
      "src/course/ui/reader.ts",
      "src/course/ui/slideTurn.ts",
      "src/course/i18n.ts",
      "src/course/handover.ts",
      "src/ui/courseFlight.ts",
      // the lesson briefing hands the aircraft over too (audit §27)
      "src/ui/learn.ts",
    ];
    for (const f of files) {
      const code = readFileSync(resolve(__dirname, "..", f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\s\/\/ .*$/gm, "");
      for (const w of RETIRED_HANDOVER_WORDS)
        expect(code.includes(w), `${f} still says "${w}"`).toBe(false);
    }
  });
});

describe("the state machine", () => {
  const run = (events: HandoverEvent[], from: HandoverState = "idle") =>
    events.reduce<HandoverState>((s, e) => handoverNext(s, e), from);

  it("idle → briefed → in control → done", () => {
    expect(run(["offer"])).toBe("briefed");
    expect(run(["offer", "take"])).toBe("inControl");
    expect(run(["offer", "take", "met"])).toBe("done");
  });
  it("handed back, taken again, retried from the start", () => {
    expect(run(["offer", "take", "handBack"])).toBe("handedBack");
    expect(run(["offer", "take", "handBack", "take"])).toBe("inControl");
    expect(run(["offer", "take", "handBack", "retry"])).toBe("briefed");
    expect(run(["offer", "take", "met", "retry"])).toBe("briefed");
    expect(run(["offer", "take", "retry"])).toBe("briefed");
  });
  it("Show me is a detour: the clip ends on the card, or the student takes over from it", () => {
    expect(run(["offer", "showMe"])).toBe("demo");
    expect(run(["offer", "showMe", "demoEnd"])).toBe("briefed");
    expect(run(["offer", "showMe", "take"])).toBe("inControl");
    expect(run(["offer", "take", "handBack", "showMe"])).toBe("demo");
  });
  it("ignores an event that makes no sense in a state", () => {
    expect(run(["take"])).toBe("idle");
    expect(run(["offer", "met"])).toBe("briefed");
    expect(run(["offer", "handBack"])).toBe("briefed");
    expect(run(["offer", "take", "met", "take"])).toBe("done");
    expect(run(["offer", "take", "met", "handBack"])).toBe("done");
  });
  it("clear always returns to idle, offer always starts again on the card", () => {
    for (const s of [
      "briefed",
      "demo",
      "inControl",
      "handedBack",
      "done",
    ] as const) {
      expect(handoverNext(s, "clear")).toBe("idle");
      expect(handoverNext(s, "offer")).toBe("briefed");
    }
  });
  it("the aircraft runs only while someone flies", () => {
    expect(
      (
        ["idle", "briefed", "demo", "inControl", "handedBack", "done"] as const
      ).filter(handoverRuns),
    ).toEqual(["demo", "inControl"]);
  });
  it("announces each state to screen readers, in the vocabulary", () => {
    expect(handoverAnnounce("inControl", "fr")).toBe(
      "Vous avez les commandes.",
    );
    expect(handoverAnnounce("briefed", "fr")).toContain("À vous");
    expect(handoverAnnounce("handedBack", "en")).toContain("handed back");
    expect(handoverAnnounce("done", "fr")).toContain("Réussi");
    expect(handoverAnnounce("idle", "fr")).toBe("");
  });
});

describe("the derived « À vous » card", () => {
  it("names the control and the gesture of THIS device", () => {
    const mouse = deriveBrief(
      { where: "stage", controls: ["bank"], goal: GOAL, clock: true },
      "mouse",
      "fr",
    );
    expect(mouse.controls).toHaveLength(1);
    expect(mouse.controls[0].name).toBe("Inclinaison");
    expect(mouse.controls[0].how).toContain("Maintenez ◀ ou ▶");
    expect(mouse.controls[0].keys).toEqual(["←", "→"]);
    expect(mouse.controls[0].pick).toBeUndefined();
    const touch = deriveBrief(
      { where: "stage", controls: ["bank"], goal: GOAL, clock: true },
      "touch",
      "fr",
    );
    expect(touch.controls[0].how).toContain("Touchez et maintenez");
    expect(touch.controls[0].keys).toEqual([]);
    const kb = deriveBrief(
      { where: "stage", controls: ["pitch"], goal: GOAL, clock: true },
      "keyboard",
      "en",
    );
    expect(kb.controls[0].how).toContain("↓ to raise the nose (pull)");
  });

  it("gives the goal with its tolerance and says how it ends", () => {
    const b = deriveBrief(
      { where: "stage", controls: ["bank"], goal: GOAL, clock: true },
      "mouse",
      "fr",
    );
    expect(b.goals).toHaveLength(2);
    expect(b.goals[0]).toMatch(/040/);
    expect(b.goals[0]).toMatch(/±\s?3/);
    expect(b.goals[1]).toMatch(/350/);
    expect(b.ends).toContain("10 secondes de suite");
    expect(b.ends).toContain("repart de zéro");
    expect(b.stakes).toContain("sans note");
    expect(b.waits).toContain("« Prendre les commandes »");
    const en = deriveBrief(
      {
        where: "stage",
        controls: ["bank"],
        goal: { ...GOAL, holdS: 0 },
        clock: true,
      },
      "mouse",
      "en",
    );
    expect(en.ends).toBe("You are done as soon as every row is ticked.");
  });

  it("prefers the author's own rows, keeps the derived ones for the rest", () => {
    const b = deriveBrief(
      {
        where: "stage",
        controls: ["bank"],
        goal: GOAL,
        rowTexts: ["Tenez la route **040**"],
        clock: true,
      },
      "mouse",
      "fr",
    );
    expect(b.goals[0]).toBe("Tenez la route **040**");
    expect(b.goals[1]).toMatch(/350/);
  });

  it("says what the helper keeps, and when there is no clock", () => {
    const held = deriveBrief(
      {
        where: "stage",
        controls: ["bank"],
        goal: GOAL,
        assist: { holdAlt: true, holdIas: true },
        clock: true,
      },
      "mouse",
      "fr",
    );
    expect(held.held).toBe("L’altitude et la vitesse sont tenues pour vous.");
    const frozen = deriveBrief(
      { where: "stage", controls: ["dragAircraft"], goal: GOAL, clock: false },
      "touch",
      "fr",
    );
    expect(frozen.waits).toContain("Pas de chrono");
    expect(frozen.controls[0].how).toContain("du doigt");
    expect(
      deriveBrief(
        { where: "stage", controls: ["obs1"], clock: true },
        "mouse",
        "fr",
      ).held,
    ).toBeNull();
  });

  it("a graded goal counts only without an assist", () => {
    const g = { ...GOAL, graded: true };
    expect(
      deriveBrief(
        { where: "stage", controls: ["bank"], goal: g },
        "mouse",
        "fr",
      ).stakes,
    ).toContain("compte");
    expect(
      deriveBrief(
        {
          where: "stage",
          controls: ["bank"],
          goal: g,
          assist: { holdAlt: true },
        },
        "mouse",
        "fr",
      ).stakes,
    ).toContain("sans note");
  });

  it("numbers several controls for the keyboard, in the order the stage draws them", () => {
    const b = deriveBrief(
      { where: "stage", controls: ["bank", "hdgBug", "obs1"], goal: GOAL },
      "mouse",
      "fr",
    );
    expect(b.controls.map((c) => [c.id, c.pick])).toEqual([
      ["obs1", "1"],
      ["hdgBug", "2"],
      ["bank", "3"],
    ]);
    expect(b.choose).toContain("1, 2, 3");
    expect(
      deriveBrief(
        { where: "stage", controls: ["bank", "hdgBug"], goal: GOAL },
        "touch",
        "fr",
      ).choose,
    ).toBeNull();
  });

  it("without a goal it says there is nothing to pass", () => {
    const b = deriveBrief(
      { where: "stage", controls: ["baro"] },
      "mouse",
      "fr",
    );
    expect(b.goals).toEqual([]);
    expect(b.ends).toContain("« Rendre les commandes »");
  });

  it("in the simulator: how the flight ends and what waits", () => {
    const b = deriveBrief({ where: "sim", durationS: 120 }, "mouse", "fr");
    expect(b.ends).toContain("2 minutes");
    expect(b.waits).toContain("position de départ");
    expect(deriveBrief({ where: "sim" }, "touch", "en").ends).toContain(
      "stops by itself when the exercise is over",
    );
  });

  it("strips a leading « À vous : » from a prompt (the card's kicker says it)", () => {
    expect(barePrompt("À vous : arrêtez la dérive")).toBe("Arrêtez la dérive");
    expect(barePrompt("Your turn: centre the needle")).toBe(
      "Centre the needle",
    );
    expect(barePrompt("Interceptez la route 090")).toBe(
      "Interceptez la route 090",
    );
  });

  it("every control has a name, a gesture per device and keys, in both languages", () => {
    for (const c of CONTROL_ORDER)
      for (const lang of ["en", "fr"] as const) {
        expect(controlName(c, lang).length).toBeGreaterThan(2);
        for (const d of ["mouse", "touch", "keyboard"] as const)
          expect(controlHow(c, d, lang).length).toBeGreaterThan(8);
        expect(controlKeys(c).length).toBeGreaterThan(0);
      }
  });

  it("orders the controls like the stage's strip", () => {
    const all = [...CONTROL_ORDER].reverse();
    const specs = controlSpecs(all, {
      sim: () => {
        throw new Error("not needed");
      },
      assist: null,
      lang: "en",
      changed: () => undefined,
    });
    expect(specs.map((s) => s.id)).toEqual([...CONTROL_ORDER]);
    expect(orderControls(["bank", "obs1"])).toEqual(["obs1", "bank"]);
  });
});

describe("the device", () => {
  const mm = (coarse: boolean, fine: boolean) => ({
    matchMedia: (q: string) => ({
      matches: q.includes("coarse") ? coarse : fine,
    }),
  });
  it("is touch on a coarse pointer with no fine one (iPad), the mouse otherwise", () => {
    expect(detectDevice(mm(true, false))).toBe("touch");
    expect(detectDevice(mm(true, true))).toBe("mouse");
    expect(detectDevice(mm(false, true))).toBe("mouse");
    expect(detectDevice({ navigator: { maxTouchPoints: 5 } })).toBe("touch");
    expect(detectDevice({})).toBe("mouse");
  });
});

describe("the keyboard map", () => {
  const key = (k: string, code = "", shiftKey = false) => ({
    key: k,
    code,
    shiftKey,
  });
  it("Esc hands the controls back", () => {
    expect(keyAction(key("Escape"), ["bank"])).toEqual({ k: "handBack" });
  });
  it("bank and pitch are one yoke: ← → bank, ↓ pulls (nose up), ↑ pushes", () => {
    const c: StageControl[] = ["bank", "pitch", "power"];
    expect(keyAction(key("ArrowLeft"), c)).toEqual({
      k: "hold",
      control: "bank",
      dir: -1,
    });
    expect(keyAction(key("ArrowRight"), c)).toEqual({
      k: "hold",
      control: "bank",
      dir: 1,
    });
    expect(keyAction(key("ArrowDown"), c)).toEqual({
      k: "hold",
      control: "pitch",
      dir: 1,
    });
    expect(keyAction(key("ArrowUp"), c)).toEqual({
      k: "hold",
      control: "pitch",
      dir: -1,
    });
    // the same when pitch is the chosen one
    expect(keyAction(key("ArrowLeft"), c, 1)).toEqual({
      k: "hold",
      control: "bank",
      dir: -1,
    });
    expect(keyAction(key("+"), c)).toEqual({ k: "power", d: 1 });
    expect(keyAction(key("-"), c)).toEqual({ k: "power", d: -1 });
  });
  it("a knob turns with the arrows, ten steps with Shift", () => {
    expect(keyAction(key("ArrowRight"), ["obs1"])).toEqual({
      k: "turn",
      control: "obs1",
      d: 1,
      coarse: false,
    });
    expect(keyAction(key("ArrowLeft", "", true), ["baro"])).toEqual({
      k: "turn",
      control: "baro",
      d: -1,
      coarse: true,
    });
    expect(keyAction(key("ArrowUp"), ["altBug"])).toEqual({
      k: "turn",
      control: "altBug",
      d: 1,
      coarse: false,
    });
  });
  it("1…9 choose the control the arrows drive (by physical key: AZERTY has no bare digits)", () => {
    const c: StageControl[] = ["obs1", "hdgBug", "bank"];
    expect(keyAction(key("é", "Digit2"), c)).toEqual({ k: "select", index: 1 });
    expect(keyAction(key("3", "Numpad3"), c)).toEqual({
      k: "select",
      index: 2,
    });
    expect(keyAction(key("4", "Digit4"), c)).toBeNull();
    expect(keyAction(key("ArrowRight"), c, 0)).toEqual({
      k: "turn",
      control: "obs1",
      d: 1,
      coarse: false,
    });
    expect(keyAction(key("ArrowRight"), c, 1)).toEqual({
      k: "turn",
      control: "hdgBug",
      d: 1,
      coarse: false,
    });
    expect(keyAction(key("ArrowRight"), c, 2)).toEqual({
      k: "hold",
      control: "bank",
      dir: 1,
    });
    // a single control needs no number
    expect(keyAction(key("1", "Digit1"), ["bank"])).toBeNull();
  });
  it("keeps the older direct keys: [ ] heading bug, A / D bank", () => {
    const c: StageControl[] = ["obs1", "hdgBug", "bank"];
    expect(keyAction(key("]"), c)).toEqual({
      k: "turn",
      control: "hdgBug",
      d: 1,
      coarse: false,
    });
    expect(keyAction(key("a"), c)).toEqual({
      k: "hold",
      control: "bank",
      dir: -1,
    });
    expect(keyAction(key("D"), c)).toEqual({
      k: "hold",
      control: "bank",
      dir: 1,
    });
  });
  it("a key control is pressed with Enter; other keys are left to the page", () => {
    expect(keyAction(key("Enter"), ["cdiSource"])).toEqual({
      k: "press",
      control: "cdiSource",
    });
    expect(keyAction(key("h"), ["bank"])).toBeNull();
    expect(keyAction(key("ArrowUp"), ["bank"])).toBeNull();
    expect(keyAction(key("ArrowLeft"), ["dragAircraft"])).toBeNull();
    expect(keyAction(key("ArrowLeft"), [])).toBeNull();
  });
});

describe("the result, in plain words", () => {
  const rows = [
    { text: "Tenez la route 040 (±3°)", ticked: true, readout: "TRK 041" },
    { text: "Descendez à 500 ft/min", ticked: false, readout: "−120 ft/min" },
  ];
  it("done: the author's sentence, or a plain one", () => {
    expect(deriveResult(rows, true, "fr")).toMatchObject({
      ok: true,
      title: "Réussi",
      missing: [],
    });
    expect(deriveResult(rows, true, "fr", "Dérive arrêtée.").why).toBe(
      "Dérive arrêtée.",
    );
  });
  it("not yet: what is outside its tolerance right now, with the value now", () => {
    const r = deriveResult(rows, false, "fr");
    expect(r.ok).toBe(false);
    expect(r.title).toBe("Pas encore");
    expect(r.why).toBe("1 sur 2 dans la tolérance en ce moment. Il manque :");
    expect(r.missing).toEqual([rows[1]]);
    expect(deriveResult([{ ...rows[1] }], false, "en").why).toContain("Nothing is within tolerance yet");
    expect(deriveResult([], false, "fr").why).toBe("Vous avez rendu les commandes.");
  });
  it("a row ticked earlier that drifted out again is missing; all in but not long enough says so", () => {
    const drifted = [
      { text: "Cap 021 (±5°)", ticked: true, now: false, readout: "HDG 029" },
      { text: "Route 040 (±3°)", ticked: true, now: true, readout: "TRK 041" },
    ];
    const r = deriveResult(drifted, false, "fr");
    expect(r.missing.map((m) => m.text)).toEqual(["Cap 021 (±5°)"]);
    expect(r.why).toContain("1 sur 2");
    const inside = drifted.map((d) => ({ ...d, now: true }));
    const h = deriveResult(inside, false, "fr", undefined, "4 / 10 s");
    expect(h.missing).toEqual([]);
    expect(h.why).toContain("pas encore assez longtemps (tenu 4 / 10 s)");
    expect(deriveResult(inside, false, "en").why).toContain("not for long enough yet.");
  });
  it("on the slide: one sentence, with the way to try again", async () => {
    const { yourTurnResultLine } = await import("../src/course/ui/slideTurn");
    const yt: YourTurn = {
      where: "slide",
      prompt: { en: "Hold it", fr: "Tenez-la" },
      goal: GOAL,
    };
    expect(
      yourTurnResultLine(
        yt,
        { met: true, checks: [true, true], secs: 14.2 },
        "fr",
      ),
    ).toBe("À vous : réussi en 14 s.");
    const no = yourTurnResultLine(
      yt,
      { met: false, checks: [true, false], secs: 9 },
      "fr",
    );
    expect(no).toContain("pas encore");
    expect(no).toContain("Il manque");
    expect(no).toContain("« À vous » pour réessayer");
    expect(
      yourTurnResultLine(
        yt,
        { met: false, checks: [false, false], secs: 9 },
        "en",
      ),
    ).toContain("Still missing");
  });
});
