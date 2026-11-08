// UX logic, step A (home and navigation): one name per place, three places in one app bar, Accueil as three doors
// or one « Reprendre », a labelled way back for courses (from=), and dialogs that close with Esc.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  academyHash,
  academyRoute,
  libraryEntries,
} from "../src/course/ui/library";
import { pickResume } from "../src/course/ui/deckHome";
import { allSamples, MATHS_VFR_ID } from "../src/course/samples";
import { HOME_COPY, HOME_LINKS } from "../src/ui/home";
import { PLACES, PLACE_HREF, placeName } from "../src/ui/appBar";
import type { CourseProgress } from "../src/course/types";

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(f) ? [p] : [];
  });
/** a source file without its comments (what can reach the screen) */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("one word per place", () => {
  it("no UI string names the hub « Flight Center », « Centre de vol » or « IFR Trainer »", () => {
    const bad = /Flight Center|Centre de vol|IFR Trainer/;
    for (const f of walk("src")) expect(bad.test(code(f)), f).toBe(false);
    for (const f of ["index.html", "academy.html"])
      expect(bad.test(readFileSync(f, "utf8")), f).toBe(false);
  });
  it("the flight set-up is « Préparer un vol » and the one-click flight « Vol rapide » everywhere", () => {
    const bad =
      /Départ rapide|Quick start|Éditeur de vols?|Construire un vol|Flight builder|flight builder/;
    for (const f of walk("src")) expect(bad.test(code(f)), f).toBe(false);
    expect(HOME_COPY.quick).toEqual({ fr: "Vol rapide", en: "Quick flight" });
    expect(HOME_COPY.plan).toEqual({
      fr: "Préparer un vol",
      en: "Plan a flight",
    });
  });
  it("the three places, their words and their pages", () => {
    expect(PLACES.map((p) => [p.fr, p.en])).toEqual([
      ["Accueil", "Home"],
      ["Bibliothèque", "Library"],
      ["Simulateur", "Simulator"],
    ]);
    expect(placeName("lib", "fr")).toBe("Bibliothèque");
    expect(PLACE_HREF).toEqual({
      home: "index.html#accueil",
      lib: "academy.html#library",
      sim: "index.html#simulateur",
    });
  });
});

describe("Accueil", () => {
  it("every word in both languages, and the doors in plain words", () => {
    for (const [k, v] of Object.entries(HOME_COPY)) {
      expect(v.fr, k).toBeTruthy();
      expect(v.en, k).toBeTruthy();
    }
    expect([HOME_COPY.learn.fr, HOME_COPY.teach.fr, HOME_COPY.fly.fr]).toEqual([
      "Apprendre",
      "Enseigner",
      "Voler",
    ]);
    expect(HOME_COPY.learnGo.fr).toBe("Voir les cours");
    expect(HOME_COPY.teachGo.fr).toBe("Créer un cours");
    expect(HOME_COPY.flyGo.fr).toBe("Ouvrir le simulateur");
  });
  it("the doors link to one library, the PPL formation, the new course page and the instructors' page", () => {
    expect(HOME_LINKS).toEqual({
      library: "academy.html#library",
      ppl: "academy.html#library&p=ppl",
      newCourse: "academy.html#new",
      instructors: "academy.html#library&p=instructors",
      simLessons: "academy.html#library&v=sim",
    });
  });
  it("one filled button per screen: the doors' page has one .primary, the returning page one, the Simulateur one", () => {
    const src = readFileSync("src/ui/home.ts", "utf8");
    // doors: « Voir les cours »; returning: « Reprendre à l’étape N »; Simulateur: « Voler maintenant »
    expect(src.match(/"wd-btn primary/g)?.length).toBe(3);
  });
  it("the page is a page: no dialog role, Esc does not close it, the library is not embedded in it", () => {
    const fc = readFileSync("src/ui/flightcenter.ts", "utf8");
    expect(fc).toMatch(/this\.escCloses = false/);
    expect(fc).toMatch(/this\.box\.removeAttribute\("role"\)/);
    expect(fc).toMatch(/h\("main", \{ class: "fc-main" \}\)/);
    // the courses view leaves for academy.html instead of mounting a second library
    expect(fc).toMatch(
      /if \(v\.type === "courses"\) \{[\s\S]{0,600}goToCourse\(`academy\.html\$\{r\}`\)/,
    );
  });
});

describe("Reprendre: one start-here, at the step the student left", () => {
  const steps = allSamples().find((c) => c.id === MATHS_VFR_ID)!.steps;
  const prog = (stepId: string): Map<string, CourseProgress> =>
    new Map([
      [
        MATHS_VFR_ID,
        {
          courseId: MATHS_VFR_ID,
          rev: 1,
          profileId: "local",
          stepId,
          reveal: 0,
          updated: "2026-11-01T10:00:00Z",
        },
      ],
    ]);
  it("a course left at step 3 resumes at step 3, with its home in words", () => {
    const list = libraryEntries({
      samples: allSamples(),
      stored: [],
      progress: prog(steps[2].id),
    });
    const d = pickResume(list, { id: MATHS_VFR_ID, stepId: steps[2].id }, "fr");
    expect(d.resume?.id).toBe(MATHS_VFR_ID);
    expect(d.resume?.index).toBe(2);
    expect(d.resume?.stepId).toBe(steps[2].id);
    expect(d.resume?.firstStepId).toBe(steps[0].id);
    expect(d.resume?.total).toBe(steps.length);
    expect(d.resume?.home).toMatch(/^LAPL · PPL › /);
  });
  it("a newcomer (nothing started, or only the first step seen) gets the doors", () => {
    const fresh = libraryEntries({ samples: allSamples(), stored: [] });
    expect(pickResume(fresh, null, "fr").resume).toBeNull();
    const first = libraryEntries({
      samples: allSamples(),
      stored: [],
      progress: prog(steps[0].id),
    });
    expect(
      pickResume(first, { id: MATHS_VFR_ID, stepId: steps[0].id }, "fr").resume,
    ).toBeNull();
  });
});

describe("a labelled way back for courses (from=)", () => {
  it("#play carries where the course was opened from", () => {
    expect(academyRoute("#play=sample-vor&s=v3&from=home")).toEqual({
      k: "play",
      id: "sample-vor",
      s: "v3",
      from: "home",
    });
    expect(academyRoute("#play=sample-vor&from=ppl")).toEqual({
      k: "play",
      id: "sample-vor",
      from: "ppl",
    });
    // anything else is dropped
    expect(academyRoute("#play=sample-vor&from=../x")).toEqual({
      k: "play",
      id: "sample-vor",
    });
    expect(
      academyHash({ k: "play", id: "sample-vor", s: "v3", from: "lib" }),
    ).toBe("#play=sample-vor&s=v3&from=lib");
  });
  it("the library opens a course with its own place as the way back", () => {
    const lib = readFileSync("src/course/ui/library.ts", "utf8");
    expect(lib).toMatch(
      /from: this\.st\.p && !this\.st\.flights \? this\.st\.p : "lib"/,
    );
  });
  it("a search typed in another page's app bar opens the library on it", () => {
    expect(academyRoute("#library&q=vor")).toEqual({ k: "library", q: "vor" });
    expect(academyRoute("#library&p=ir&q=attente")).toEqual({
      k: "library",
      p: "ir",
      q: "attente",
    });
    // never written back into the hash
    expect(academyHash({ k: "library", q: "vor" })).toBe("#library");
  });
  it("the player's back button shows its word, not a bare chevron", () => {
    const pl = readFileSync("src/course/ui/player.ts", "utf8");
    expect(pl).toMatch(/class: "cp-btn cp-backto"/);
    expect(pl).toMatch(/h\("span", \{ class: "cp-backto-w" \}, backWord\)/);
  });
});

describe("dialogs", () => {
  const m = readFileSync("src/ui/modals.ts", "utf8");
  it("Esc closes the top dialog (capture phase: fields stop every key), a page excepted", () => {
    expect(m).toMatch(
      /this\.bg\.addEventListener\('keydown', \(e\) => \{[\s\S]{0,900}this\.close\(\);\s*\}, true\);/,
    );
    expect(m).toMatch(/static escape\(\): boolean/);
    expect(readFileSync("src/main.ts", "utf8")).toMatch(
      /if \(e\.key === 'Escape'\) Modal\.escape\(\);/,
    );
  });
  it("the focus goes to the dialog's title, the rest of the page is inert, and the close button speaks the language", () => {
    expect(m).toMatch(/:scope > header h2/);
    expect(m).toMatch(/c\.inert = true/);
    expect(m).toMatch(
      /closeLabel = \(\) => \(uiLang\(\) === 'fr' \? 'Fermer' : 'Close'\)/,
    );
  });
  it("the page language and title follow the switch", () => {
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toMatch(/document\.documentElement\.lang = l;/);
    expect(readFileSync("src/learn/main.ts", "utf8")).toMatch(
      /document\.documentElement\.lang = l;/,
    );
  });
});
