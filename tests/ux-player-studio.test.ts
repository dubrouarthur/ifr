// UX logic, step C (course player, presenter and studio entry): honest words on the end screen, one chip per task,
// the Nouveau cours page (#new) that saves nothing before « Créer le cours », plain words in the editor, the
// presenter's legend in words, and a first frame of academy.html that is never blank.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Step } from "../src/course/types";
import { isTask, ps, taskLabel } from "../src/course/ui/reader";
import { markText } from "../src/course/ui/outline";
import { academyHash, academyRoute } from "../src/course/ui/library";
import {
  buildNewCourse,
  NEW_COURSE_FORMATIONS,
  starterFormations,
  starterMeta,
  startersFor,
} from "../src/course/ui/newCourse";
import { BLANK_STARTER, DECK_STARTERS } from "../src/course/ui/deckStarters";
import { courseMinutes } from "../src/course/ui/templates";

const step = (over: Partial<Step>): Step => ({
  id: "s",
  kind: "explain",
  title: { en: "A step", fr: "Une étape" },
  reader: [],
  ...over,
});
/** a source file without its comments (what can reach the screen) */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("the course player says what is true", () => {
  it("a task is a question, an exercise with a goal, a calculation or a flight; reading is not", () => {
    expect(isTask(step({ kind: "explain" }))).toBe(false);
    expect(isTask(step({ kind: "slide" }))).toBe(false);
    expect(isTask(step({ kind: "try" }))).toBe(false);
    expect(
      isTask(step({ kind: "try", goal: { all: [], graded: false } })),
    ).toBe(true);
    for (const k of ["quiz", "calc", "drill", "fly", "predict"] as const)
      expect(isTask(step({ kind: k })), k).toBe(true);
  });
  it("one chip word per task (Manipulation · Exercice · Calcul · Quiz · Vol au simulateur), none for reading", () => {
    expect(taskLabel(step({ kind: "explain" }), "fr")).toBeNull();
    expect(taskLabel(step({ kind: "try" }), "fr")).toBe("Manipulation");
    expect(
      taskLabel(step({ kind: "try", goal: { all: [], graded: false } }), "fr"),
    ).toBe("Exercice");
    expect(taskLabel(step({ kind: "calc" }), "fr")).toBe("Calcul");
    expect(taskLabel(step({ kind: "quiz" }), "en")).toBe("Quiz");
    expect(taskLabel(step({ kind: "fly" }), "fr")).toBe("Vol au simulateur");
    expect(taskLabel(step({ kind: "fly" }), "en")).toBe("Simulator flight");
  });
  it("end-screen rows: a skipped task is « à faire », never « fait »; a quiz is « juste » or « faux »", () => {
    const quiz = step({ kind: "quiz" });
    const read = step({ kind: "explain" });
    const ex = step({ kind: "try", goal: { all: [], graded: false } });
    expect(markText(quiz, { visited: true, skipped: true }, "fr")).toBe(
      "à faire",
    );
    expect(markText(ex, { visited: true, skipped: true }, "fr")).toBe(
      "à faire",
    );
    expect(
      markText(quiz, { visited: true, answered: true, correct: true }, "fr"),
    ).toBe("juste");
    expect(markText(quiz, { visited: true, answered: true }, "fr")).toBe(
      "faux",
    );
    expect(markText(ex, { visited: true, goalMet: true }, "fr")).toBe("fait");
    expect(markText(read, { visited: true }, "fr")).toBe("vu");
  });
  it("the player's words: Sommaire, Précédent, Un indice, no « en autonomie »", () => {
    expect(ps("outline", "fr")).toBe("Sommaire");
    expect(ps("back", "fr")).toBe("Précédent");
    expect(ps("hint", "fr")).toBe("Un indice");
    expect(ps("remaining", "fr")).toBe("Faire les exercices restants");
    expect(ps("doneOf", "fr", { n: 1, total: 4 })).toBe("1 sur 4 fait");
    const src = [
      "src/course/ui/reader.ts",
      "src/course/ui/player.ts",
      "src/course/ui/outline.ts",
    ]
      .map(code)
      .join("\n");
    expect(src).not.toMatch(/en autonomie|Plan du cours|"Revoler"|, "Plan"\]/);
  });
});

describe("Nouveau cours (#new)", () => {
  it("is a route of its own, with the formation, the subject and the way back", () => {
    expect(academyRoute("#new")).toEqual({ k: "new" });
    expect(academyRoute("#new&p=ppl&s=ppl.law&from=ppl")).toEqual({
      k: "new",
      p: "ppl",
      s: "ppl.law",
      from: "ppl",
    });
    // a subject without its formation, or a crafted value, is dropped
    expect(academyRoute("#new&s=ppl.law")).toEqual({ k: "new" });
    expect(academyRoute("#new&p=../x")).toEqual({ k: "new" });
    expect(academyHash({ k: "new", p: "ir", s: "ir.hold", from: "lib" })).toBe(
      "#new&p=ir&s=ir.hold&from=lib",
    );
  });
  it("shows the chosen formation's templates first and the empty course last", () => {
    for (const p of NEW_COURSE_FORMATIONS) {
      const list = startersFor(p);
      expect(list.at(-1)?.id).toBe(BLANK_STARTER.id);
      expect(list).toHaveLength(DECK_STARTERS.length + 1);
      const mine = DECK_STARTERS.filter((d) =>
        starterFormations(d).includes(p),
      );
      expect(list.slice(0, mine.length).map((d) => d.id)).toEqual(
        mine.map((d) => d.id),
      );
    }
    expect(starterFormations(startersFor("ppl")[0])).toContain("ppl");
    expect(starterFormations(startersFor("ir")[0])).toContain("ir");
  });
  it("makes the course only from what was chosen: the template's steps, the title, the formation and subject", () => {
    const d = startersFor("ppl")[0];
    const c = buildNewCourse({
      id: "mon-cours-1",
      lang: "fr",
      title: "  Le tour de piste à Lognes ",
      program: "ppl",
      subject: "ppl.law",
      starter: d,
    });
    expect(c.id).toBe("mon-cours-1");
    expect(c.steps).toHaveLength(d.slides.length);
    expect(c.title).toEqual({
      en: "Le tour de piste à Lognes",
      fr: "Le tour de piste à Lognes",
    });
    expect(c.program).toBe("lapl-ppl");
    expect(c.subject).toBe("ppl.law");
    // a subject of another formation is never filed
    const x = buildNewCourse({
      id: "x",
      lang: "fr",
      title: "",
      program: "ir",
      subject: "ppl.law",
      starter: d,
    });
    expect(x.subject).toBeUndefined();
    // « Cours vide » is one blank slide
    const blank = buildNewCourse({
      id: "b",
      lang: "fr",
      title: "",
      program: null,
      subject: null,
      starter: BLANK_STARTER,
    });
    expect(blank.steps).toHaveLength(1);
    expect(blank.program).toBeUndefined();
  });
  it("a card's « N étapes · environ M min » is what the editor will say", () => {
    for (const d of DECK_STARTERS) {
      const c = buildNewCourse({
        id: "x",
        lang: "fr",
        title: "",
        program: null,
        subject: null,
        starter: d,
      });
      expect(starterMeta(d, "fr")).toBe(
        `${d.slides.length} étapes · environ ${Math.max(1, courseMinutes(c))} min`,
      );
    }
    expect(starterMeta(BLANK_STARTER, "fr")).toBe("1 étape");
  });
  it("the library and the router no longer save a draft on « Nouveau cours »", () => {
    const lib = code("src/course/ui/library.ts");
    const m = lib.match(/private newCourse\([^)]*\) \{[\s\S]*?\n  \}/);
    expect(m?.[0]).toBeTruthy();
    expect(m![0]).not.toMatch(/\.save\(|newId\(/);
    expect(code("src/learn/main.ts")).not.toMatch(/showLibrary\("new"\)/);
  });
});

describe("plain words in the editor and the presenter", () => {
  it("the editor and the studio say none of the old jargon", () => {
    const src = [
      "src/course/ui/editor.ts",
      "src/course/ui/studio.ts",
      "src/course/ui/inspector.ts",
      "src/course/ui/tray.ts",
      "src/course/ui/deckStarters.ts",
      "src/course/canvas/strings.ts",
      "src/course/canvas/themes.ts",
    ]
      .map(code)
      .join("\n");
    expect(src).not.toMatch(
      /Voler pour capturer|Tester comme élève|Calques|"Marque"|"Multiple"|Salle de cours|belle présentation|pour la nuit ou l’IMC/,
    );
    expect(src).toMatch(/Aperçu élève/);
    expect(src).toMatch(/Capturer depuis le simulateur/);
    expect(src).toMatch(/Éléments de la diapo/);
    expect(src).toMatch(/Logo du club/);
  });
  it("the presenter's legend is in words and opens « l’écran de projection »", () => {
    const src = code("src/course/ui/presenter.ts");
    expect(src).toMatch(
      /→ suivant · ← précédent · N écran noir · Échap quitter/,
    );
    expect(src).toMatch(/Ouvrir l’écran de projection/);
    expect(src).not.toMatch(/scène initiale|Ouvrir le projecteur/);
  });
  it("academy.html paints its skeleton before the app module runs", () => {
    const html = readFileSync("academy.html", "utf8");
    const boot = html.indexOf("ga-boot-t");
    const mod = html.indexOf('type="module"');
    expect(boot).toBeGreaterThan(0);
    expect(boot).toBeLessThan(mod);
    expect(html).toMatch(/Ouverture du cours…/);
  });
});
