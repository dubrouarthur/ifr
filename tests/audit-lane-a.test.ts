// Audit lane A (intuitiveness): the player, library, Accueil and cockpit say what is true and use one glossary.
import { describe, expect, it } from "vitest";
import { basicInstrumentsCourse } from "../src/course/samples/decks/basicInstruments";
import { courseTally } from "../src/course/ui/player";
import { openText, markText, type StepMark } from "../src/course/ui/outline";
import { ps, taskLabel } from "../src/course/ui/reader";
import { captureBoot, noteFly, readFlyNote } from "../src/course/cockpitLink";
import { mathsVfrScenes } from "../src/course/samples/mathsVfr";
import { steadyWind } from "../src/sim/wind";

describe("§1 the end screen after a course walked with « Suivant » only", () => {
  const course = basicInstrumentsCourse();
  const steps = course.steps;
  // what the player records when the student only presses « Suivant »: every step seen, every task left skipped
  const walked: Record<string, StepMark> = Object.fromEntries(
    steps.map((s) => [s.id, { visited: true, skipped: true } as StepMark]),
  );
  it("is « parcouru », never « terminé »: every exercise is left", () => {
    const t = courseTally(steps, walked);
    expect(t.allDone).toBe(false);
    expect(t.tasks.length).toBeGreaterThanOrEqual(4);
    expect(t.left.length).toBe(t.tasks.length);
    expect(t.met).toBe(0);
    expect(t.right).toBe(0);
    // the words the end screen picks
    const sub = t.allDone ? ps("courseDoneSub", "fr") : ps("courseWalkedSub", "fr");
    expect(sub).toBe(ps("courseWalkedSub", "fr"));
    expect(sub).not.toMatch(/Tous les exercices sont faits/);
  });
  it("each open row says what is missing in its own words", () => {
    const words = steps
      .filter((s) => courseTally(steps, walked).left.includes(s))
      .map((s) => `${taskLabel(s, "fr")} · ${openText(s, "fr")}`);
    expect(words).toContain("À vous · à faire");
    expect(words).toContain("Question · sans réponse");
    expect(words).toContain("Vol au simulateur · pas fait");
    // a reading step is simply seen
    const read = steps.find((s) => !taskLabel(s, "fr"))!;
    expect(markText(read, walked[read.id], "fr")).toBe("vu");
  });
  it("is « terminé » once every task was attempted", () => {
    const done: Record<string, StepMark> = { ...walked };
    for (const s of courseTally(steps, walked).tasks)
      done[s.id] = { visited: true, goalMet: true, answered: true };
    expect(courseTally(steps, done).allDone).toBe(true);
  });
});

describe("§2 sharing a built-in course by link", () => {
  it("every built-in course gets a short link to its own address", async () => {
    const { allSamples } = await import("../src/course/samples");
    const { sampleShareUrl, academyRoute } = await import("../src/course/ui/library");
    const all = allSamples();
    expect(all.length).toBeGreaterThan(10);
    for (const c of all) {
      const u = sampleShareUrl(c.id, "academy.html", "https://wingdeck.example/app/");
      expect(u.length, c.id).toBeLessThan(200);
      expect(u.startsWith("https://wingdeck.example/app/academy.html#play=")).toBe(true);
      // the link opens that course
      const r = academyRoute(new URL(u).hash);
      expect(r).toMatchObject({ k: "play", id: c.id });
    }
  });
  it("the library opens .wingdeck and .ifrcourse files", async () => {
    const { isCourseFileName } = await import("../src/course/ui/library");
    expect(isCourseFileName("Cours de navigation.wingdeck")).toBe(true);
    expect(isCourseFileName("my-course.ifrcourse")).toBe(true);
    expect(isCourseFileName("photo.png")).toBe(false);
  });
});

describe("§3 « Mes cours et brouillons » lists every course of my own", () => {
  it("a course filed in a formation is also in Mes cours, and the counts match the landing", async () => {
    const { courseItems } = await import("../src/library/sources");
    const { programView } = await import("../src/library/model");
    const own = (id: string, course: Record<string, unknown> | null) => ({
      id,
      title: { en: id, fr: id },
      shelf: "draft" as const,
      assigned: false,
      sample: false,
      briefing: false,
      steps: 3,
      langs: ["fr" as const],
      tags: ["ppl"],
      updated: "2026-11-16T10:00:00Z",
      mix: { learn: 3, act: 0, fly: 0 },
      ...(course ? { course: course as never } : {}),
    });
    const items = courseItems([
      own("filed", { program: "lapl-ppl", subject: "ppl.prep" }),
      own("later", null),
    ]);
    const mine = programView(items, "instructors").index.find(
      (x) => x.subject.id === "instructors.mine",
    )!;
    expect(mine.n).toBe(2);
    // the filed one is still in its formation
    const ppl = programView(items, "ppl").index.find((x) => x.subject.id === "ppl.prep")!;
    expect(ppl.n).toBe(1);
  });
});

describe("§3 Accueil offers « Reprendre la modification »", () => {
  it("the course of my own edited last, never a built-in or a received one", async () => {
    const { pickResume } = await import("../src/course/ui/deckHome");
    const e = (id: string, updated: string, extra: Record<string, unknown> = {}) =>
      ({
        id,
        title: { en: id, fr: id },
        shelf: "draft",
        assigned: false,
        sample: false,
        briefing: false,
        steps: 3,
        langs: ["fr"],
        tags: [],
        updated,
        mix: { learn: 3, act: 0, fly: 0 },
        ...extra,
      }) as never;
    const d = pickResume(
      [
        e("old", "2026-11-01T00:00:00Z"),
        e("new", "2026-11-15T00:00:00Z"),
        e("club", "2026-11-16T00:00:00Z", { shelf: "club" }),
        e("sample-x", "2026-11-16T00:00:00Z", { sample: true, shelf: "sample" }),
      ],
      null,
      "fr",
    );
    expect(d.editing?.id).toBe("new");
    expect(pickResume([], null, "fr").editing).toBeNull();
  });
});

describe("§4 a formation card says what is really there", () => {
  it("counts slide courses, the subjects covered, flights and check-lists; never one « éléments » number", async () => {
    const { allSamples, SAMPLES } = await import("../src/course/samples");
    const { libraryEntries } = await import("../src/course/ui/library");
    const { libraryItems } = await import("../src/library/sources");
    const { libraryFor, CATEGORY_LABELS } = await import("../src/train/procedureLibrary");
    const { shelves, programView, coverage } = await import("../src/library/model");
    const { lt } = await import("../src/library/strings");
    const items = libraryItems({
      lang: "fr",
      courses: libraryEntries({ samples: allSamples(), stored: [] }),
      sampleProgram: (id) => SAMPLES.find((s) => s.id === id)?.program,
      procedures: libraryFor("fr"),
      categories: CATEGORY_LABELS,
    });
    const ppl = shelves(items).find((x) => x.program === "ppl")!;
    expect(ppl.kinds.course + ppl.kinds.sim + ppl.kinds.proc).toBe(ppl.total);
    expect(ppl.subjects).toBe(15);
    expect(ppl.ready).toBeLessThan(ppl.subjects);
    // ready = the subjects the page draws with something in them; the rest are « en préparation »
    const cov = coverage(programView(items, "ppl"));
    expect(cov.ready + cov.soon).toBe(15);
    expect(cov.ready).toBe(ppl.ready);
    expect(lt("subjectsReady", "fr", { r: cov.ready, n: 15 })).toBe(`${cov.ready} matières sur 15`);
    expect(lt("steps", "fr", { n: 16 })).toBe("16 diapos");
  });
});

describe("§5 a flight left for Accueil is offered back", () => {
  it("the card's clock reads m:ss, then h:mm:ss", async () => {
    const { flightClock } = await import("../src/ui/home");
    expect(flightClock(5.7)).toBe("0:05");
    expect(flightClock(187)).toBe("3:07");
    expect(flightClock(3727)).toBe("1:02:07");
  });
  it("main.ts counts the time flown and wires « Reprendre le vol » / « Terminer et débriefer »", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).toMatch(/flight: \(\) => \(flightUnderWay\(\)/);
    expect(src).toMatch(/resumeFlight: \(\) => \{ if \(sim\.paused\) togglePause\(\); \}/);
    expect(src).toMatch(/endFlight: \(\) => endFlight\(\)/);
    const fc = readFileSync("src/ui/flightcenter.ts", "utf8");
    // Esc on Accueil goes back to the paused flight
    expect(fc).toMatch(/this\.escCloses = !!this\.hooks\.flight\?\.\(\);/);
  });
});

describe("§6 on a phone the cockpit's Pause and Plus stay on screen", () => {
  it("the top bar drops View, EFB and Instructor into Plus under 600 px, labels stay accessible names", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/styles/ui-shell.css", "utf8");
    const phone = css.slice(css.indexOf("@media (max-width: 600px)"));
    for (const sel of [".tb-views", ".tb-efb", ".tb-ios"]) expect(phone).toContain(`html body .topbar ${sel}`);
    // the words are visually hidden, never display:none (they name the icon buttons)
    expect(phone).toMatch(/\.tb-pause \.lbl,[\s\S]*?clip-path: inset\(50%\)/);
    expect(phone).toMatch(/min-width: 44px;\s*min-height: 44px;/);
    const main = readFileSync("src/main.ts", "utf8");
    for (const w of ["'View…'", "'EFB: charts and checklists'", "'Instructor station'"])
      expect(main).toMatch(new RegExp(`phoneItem\\(I\\.\\w+, ${w}`));
    expect(main).toMatch(/phoneItem\(I\.eye, 'View…'/);
    expect(main).toMatch(/'Instructor station': 'Poste instructeur'/);
  });
});

describe("§7 a capture link never opens on the default flight with « Accueil » as the only way out", () => {
  const scene = "S1.XZTdbtw2EIVfpTjX";
  it("reads capture mode, the slide's situation and the way back from the link alone", () => {
    expect(captureBoot(`?capture=c1&step=s2&scene=${scene}&return=academy.html%23edit%3Dc1`)).toEqual({ capturing: true, scene: true, back: true });
    expect(captureBoot("?capture=c1&return=academy.html")).toEqual({ capturing: true, scene: false, back: true });
    // a bad scene code is not posed: the free flight starts at once
    expect(captureBoot("?capture=c1&scene=nope")).toEqual({ capturing: true, scene: false, back: false });
    // a course flight (?fly=) is not capture mode, nor is a plain cockpit
    expect(captureBoot(`?fly=tok&capture=c1&scene=${scene}`).capturing).toBe(false);
    expect(captureBoot("").capturing).toBe(false);
  });
  it("the cockpit waits under « Préparation de la capture… », falls back after 8 s, and the top bar goes back to the slide", async () => {
    const { readFileSync } = await import("node:fs");
    const main = readFileSync("src/main.ts", "utf8");
    // no default flight under a link that carries the slide's situation
    expect(main).toMatch(/if \(captureBoot && !capBoot\.scene\) startCaptureFlight\(\);/);
    expect(main).not.toMatch(/if \(deepQ\.has\('capture'\) && !deepQ\.has\('fly'\)\) startScenario/);
    expect(main).toMatch(/captureFallbackNow\(false\); \}, 8000\)/);
    expect(main).toMatch(/if \(captureBoot\) captureFallbackNow\(true\);/);
    expect(main).toMatch(/'tb\.backSlide': 'Revenir à la diapo'/);
    const cf = readFileSync("src/ui/courseFlight.ts", "utf8");
    expect(cf).toMatch(/"cf\.preparingCapture": "Préparation de la capture…"/);
    expect(cf).toMatch(/"cf\.preparingCapture": "Preparing the capture…"/);
  });
});

describe("§8 an exercise on a slide is done with the slide's own controls", () => {
  const course = basicInstrumentsCourse();
  const step = course.steps.find((s) => s.id === "bi-asi-try")!;
  const turns = (step.slide?.blocks ?? []).flatMap((b) =>
    "yourTurn" in b && b.yourTurn ? [{ id: b.id, yt: b.yourTurn }] : [],
  );
  it("the live instrument with its controls is the exercise; its button only enlarges it (FR and EN)", async () => {
    const { onSlideTurnIds, enlargeWords } = await import("../src/course/ui/slideTurn");
    expect(onSlideTurnIds(step)).toEqual(turns.map((t) => t.id));
    expect(enlargeWords("fr").label).toBe("Agrandir");
    expect(enlargeWords("en").label).toBe("Enlarge");
    // a slide with no exercise has none
    expect(onSlideTurnIds(course.steps.find((s) => s.id !== step.id && !s.slide?.blocks.some((b) => "yourTurn" in b && b.yourTurn))!)).toEqual([]);
  });
  it("the goal ticks on the slide only after a touch, and the hint says itself after 20 s without progress", async () => {
    const { watchLiveGoals, stuckLine } = await import("../src/course/ui/slideTurn");
    const { Sim } = await import("../src/sim/sim");
    const { applyScene } = await import("../src/course/scene");
    const sim = new Sim();
    const scene = course.scenes!["bi.slow"];
    applyScene(sim, scene);
    let t = 0;
    let tick: () => void = () => undefined;
    const listeners: ((e: Event) => void)[] = [];
    const el = {
      isConnected: true,
      addEventListener: (_k: string, f: (e: Event) => void) => listeners.push(f),
      removeEventListener: () => undefined,
    } as unknown as HTMLElement;
    const stuck: string[] = [];
    let rows = 0;
    const stop = watchLiveGoals({
      el,
      v: { sims: { get: () => ({ sim }) } } as never,
      step,
      lang: "fr",
      turns,
      onRows: () => rows++,
      onMet: () => undefined,
      onStuck: (yt) => stuck.push(stuckLine(yt, "fr")),
      now: () => t,
      every: (f) => ((tick = f), () => undefined),
    });
    // untouched: nothing is tracked, however long it waits
    for (let i = 0; i < 100; i++) ((t += 250), tick());
    expect(stuck).toEqual([]);
    expect(rows).toBe(0);
    listeners.forEach((f) => f({ target: null } as unknown as Event));
    // touched but the power left as it is (the sim is not stepped: no progress): the hint comes once, after 20 s
    for (let i = 0; i < 79; i++) ((t += 250), tick());
    expect(stuck).toEqual([]);
    for (let i = 0; i < 10; i++) ((t += 250), tick());
    expect(stuck.length).toBe(1);
    expect(stuck[0]).toMatch(/^Un indice : Mettez la puissance vers 30 %/);
    stop();
  });
  it("the tip gives the number to set, the same as the hint", () => {
    const yt = turns[0].yt;
    expect(yt.hint && yt.hint.fr).toMatch(/30 %/);
    expect(JSON.stringify(step)).toMatch(/30 % \(6 clics sur −\)/);
  });
  it("the stage bar names a navaid only for a navigation exercise", async () => {
    const { goalIsNav } = await import("../src/course/goals");
    const { sceneLine } = await import("../src/course/stage/views");
    const { Sim } = await import("../src/sim/sim");
    expect(goalIsNav(turns[0].yt.goal.all)).toBe(false);
    expect(goalIsNav([{ id: "obs" }])).toBe(true);
    expect(goalIsNav([{ id: "ias" }, { id: "passedFix" }])).toBe(true);
    const sim = new Sim();
    const off = sceneLine(sim, "fr", false);
    expect(off.main).not.toMatch(/NM|R-\d/);
    expect(off.main).toMatch(/ft/);
  });
});

describe("§10 the end of a course leads somewhere", () => {
  it("offers the next course of the programme, in syllabus order, never one of another programme", async () => {
    const { nextCourseAfter } = await import("../src/course/ui/library");
    const { allSamples } = await import("../src/course/samples");
    const { programOf, compareInLibrary } = await import("../src/library/model");
    const samples = allSamples();
    const n = nextCourseAfter("sample-deck-basic-instruments", samples);
    expect(n).not.toBeNull();
    expect(n!.id).not.toBe("sample-deck-basic-instruments");
    expect(n!.title.fr).toBeTruthy();
    // a course of my own (not built in) has no « Cours suivant »
    expect(nextCourseAfter("my-own-course", samples)).toBeNull();
    // the chain never leaves the programme and ends
    const { libraryEntries } = await import("../src/course/ui/library");
    const { libraryItems } = await import("../src/library/sources");
    const items = libraryItems({ lang: "en", courses: libraryEntries({ samples, stored: [] }), flights: false })
      .filter((i) => i.kind === "course")
      .sort(compareInLibrary);
    const prog = (id: string) => programOf(items.find((i) => i.key === `course:${id}`)!);
    let id: string | undefined = "sample-deck-basic-instruments";
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const nx = nextCourseAfter(id, samples);
      if (nx) expect(prog(nx.id)).toBe(prog(id));
      id = nx?.id;
    }
    expect(id).toBeUndefined();
  });
  it("shares a built-in course by its address", async () => {
    const { courseShareUrl } = await import("../src/course/ui/library");
    const { basicInstrumentsCourse: b } = await import("../src/course/samples/decks/basicInstruments");
    const r = await courseShareUrl(b(), true, "academy.html", "https://example.org/app/");
    expect(r).toEqual({ ok: true, url: "https://example.org/app/academy.html#play=sample-deck-basic-instruments" });
  });
  it("the end screen's words exist in both languages", () => {
    expect(ps("finishTasks", "fr", { n: 3 })).toBe("Finir les exercices (3)");
    expect(ps("nextCourse", "fr", { t: "X" })).toBe("Cours suivant : X");
    expect(ps("nextCourse", "en", { t: "X" })).toBe("Next course: X");
    expect(ps("duplicateEdit", "fr")).toBe("Dupliquer pour modifier");
  });
});

describe("§11 a beginner starts with the basic instruments", () => {
  it("LAPL · PPL names its first course, and « Je débute » opens it with the formation as its way back", async () => {
    const { programDef } = await import("../src/library/programs");
    const { isSampleId } = await import("../src/course/samples");
    const { HOME_LINKS } = await import("../src/ui/home");
    const start = programDef("ppl").start!;
    expect(start).toBe("sample-deck-basic-instruments");
    expect(isSampleId(start)).toBe(true);
    expect(HOME_LINKS.ppl).toBe(`academy.html#play=${start}&from=ppl`);
  });
  it("the formation's progress counts courses only, never the check-lists", async () => {
    const { courseProgress } = await import("../src/course/ui/library");
    const { lt } = await import("../src/library/strings");
    const mk = (kind: string, done = false) =>
      ({ kind, progress: done ? { done: 3, total: 3, passed: true } : undefined }) as never;
    const p = courseProgress([mk("course", true), mk("course"), mk("proc"), mk("proc"), mk("sim", true)]);
    expect(p).toEqual({ n: 2, done: 1 });
    expect(lt("coursesDoneOf", "fr").replace("{d}", "0").replace("{n}", "10")).toBe("0 sur 10 cours terminés");
  });
});

describe("§12 « Reprendre » for a course left on its last step with an exercise still to do", () => {
  it("the last step is still part-way while a task is open, and no longer once every task was tried", async () => {
    const { pickResume, openTaskSteps } = await import("../src/course/ui/deckHome");
    const { libraryEntries } = await import("../src/course/ui/library");
    const course = basicInstrumentsCourse();
    const lastStep = course.steps[course.steps.length - 1];
    const list = libraryEntries({ samples: [course], stored: [] });
    const at = { id: course.id, stepId: lastStep.id };
    // nothing tried yet: every task is open, the student is offered the step they left (the simulator flight)
    const open = openTaskSteps(course, []);
    expect(open.length).toBeGreaterThanOrEqual(4);
    const d = pickResume(list, at, "fr", new Map([[course.id, open]]));
    expect(d.resume?.stepId).toBe(lastStep.id);
    expect(d.resume?.index).toBe(course.steps.length - 1);
    // a slide's « À vous » recorded under « <step>~yt~<block> » counts for its slide; every task tried: no Reprendre
    const all = course.steps.map((s) => ({ stepId: `${s.id}~yt~b1` }));
    expect(openTaskSteps(course, all)).toEqual([]);
    expect(pickResume(list, at, "fr", new Map([[course.id, []]])).resume).toBeNull();
    // without attempts known, the position alone decides (as before)
    expect(pickResume(list, at, "fr").resume).toBeNull();
  });
});

describe("§13 the Sommaire heads its sections in the screen language", () => {
  it("no English section key shows in the French Sommaire of any built-in course", async () => {
    const { sectionLabel } = await import("../src/course/i18n");
    const { allSamples } = await import("../src/course/samples");
    const keys = new Set(allSamples().flatMap((c) => c.steps.map((s) => s.section).filter((x): x is string => !!x)));
    expect(keys.size).toBeGreaterThan(0);
    for (const k of keys) {
      const fr = sectionLabel(k, "fr");
      expect(fr, k).not.toMatch(/^(overview|picture|technique|check|why|numbers|entry|mistakes|clearance|wind|errors)$/i);
    }
    expect(sectionLabel("overview", "fr")).toBe("Présentation");
    expect(sectionLabel("technique", "fr")).toBe("À vous");
    expect(sectionLabel("check", "en")).toBe("Check");
    // an author's own heading stays as written
    expect(sectionLabel("Mon chapitre", "fr")).toBe("Mon chapitre");
  });
  it("outline.ts prints the section through sectionLabel", async () => {
    const { readFileSync } = await import("fs");
    expect(readFileSync("src/course/ui/outline.ts", "utf8")).toMatch(/sectionLabel\(s\.section, lang\)/);
  });
});

describe("§14 a question on a slide: the whole feedback, a second try, 44 px answers on a phone", () => {
  it("the player refits the slide after an answer, offers « Réessayer » and mirrors the answers under a small slide", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/course/ui/player.ts", "utf8");
    expect(src).toMatch(/export function wireSlideQuizRetry/);
    expect(src).toMatch(/host\.relayout\?\.\(\)/);
    expect(src).toMatch(/export function slideQuizProxy/);
    // both slide renderers can refit
    expect(src).toMatch(/relayout: \(\) => v\.relayout\(\)/);
    expect(readFileSync("src/course/ui/slideTurn.ts", "utf8")).toMatch(/relayout: \(\) => v\.relayout\(\)/);
    expect(ps("tryAgain", "fr")).toBe("Réessayer");
    expect(ps("tryAgain", "en")).toBe("Try again");
    const css = readFileSync("src/styles/course.css", "utf8");
    expect(css).toMatch(/\.cp-slidequiz \.cp-opt \{\s*min-height: 48px;/);
    expect(css).toMatch(/min-height: calc\(44px \/ var\(--sl-k, 1\)\)/);
  });
});

describe("§15 a course flight: one way back, one goal line, the aircraft waits while it asks", () => {
  it("the top-left button goes back to the course and asks with the aircraft paused", async () => {
    const { readFileSync } = await import("fs");
    const main = readFileSync("src/main.ts", "utf8");
    const cf = readFileSync("src/ui/courseFlight.ts", "utf8");
    // « ← <titre du cours> » does what the strip's « Reprendre le cours » does; Accueil stays in the flight menu
    expect(main).toMatch(/courseFlyBoot \|\| courseBridge\?\.handoff \? courseUi\.requestBack\(\)/);
    expect(main).toMatch(/flightItem\(I\.home, 'Home', 'F2'/);
    expect(main).toMatch(/const want = st\.flight \? st\.flight\.course :/);
    // the question, in the strip, never « Partir »
    expect(cf).toMatch(/"cf\.leaveQ": "Revenir au cours sans résultat \?"/);
    expect(cf).toMatch(/"cf\.leave": "Revenir au cours"/);
    expect(cf).toMatch(/"cf\.leaveQ": "Back to the course without a result\?"/);
    expect(cf).not.toMatch(/"Partir/);
    // asking pauses (hold) and « Continuer le vol » flies on (release); no pause veil or top-bar Pause meanwhile
    expect(cf).toMatch(/this\.confirming = true;\s*this\.held = this\.act\.hold\?\.\(\) \?\? false;/);
    expect(cf).toMatch(/if \(this\.held\) this\.act\.release\?\.\(\);/);
    expect(main).toMatch(/hold: \(\) => \{ const was = !sim\.paused; sim\.paused = true;/);
    expect(main).toMatch(/!courseUi\.briefOpen && !courseUi\.asking && previewT === null/);
    expect(main).toMatch(/const hidePause = courseLoading \|\| courseUi\.briefOpen \|\| courseUi\.asking;/);
  });
  it("the situation bar keeps the phase and the altitude; no autopilot bar on a six-pack lesson; the exercise window folds", async () => {
    const { readFileSync } = await import("fs");
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toMatch(/const keep = new Set\(\[sbw\('Phase'\), sbw\('Altitude'\)/);
    expect(main).toMatch(/const noAp = !!st\.flight && cockpitType === 'steam' && !sim\.ap\.engaged;/);
    expect(main).toMatch(/afcsBar && cockpitType !== 'airliner' && !courseNoAp/);
    expect(main).toMatch(/lessonWin\.foldForFlight\(st\.flight\?\.goal \?/);
    const lw = readFileSync("src/ui/lessonWindow.ts", "utf8");
    // once per flight, nothing saved: unfolding it keeps the pilot's own fold
    expect(lw).toMatch(/if \(key === this\.foldKey\) return;/);
    expect(lw).toMatch(/if \(this\.foldedForFlight && !this\.peek && !this\.st\.enlarged\) return true;/);
  });
});

describe("§16 slide to cockpit: the loading card names the step and can be cancelled; the wind is the slide's", () => {
  const mem = (): Storage => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } } as Storage;
  };
  it("the course page leaves a note for its own ?fly= token only", () => {
    const s = mem();
    noteFly({ token: "T1", course: "Les instruments de base", step: "Les six à la fois", back: "academy.html#play=c&s=x" }, s);
    expect(readFlyNote("?fly=T1", s)).toEqual({ token: "T1", course: "Les instruments de base", step: "Les six à la fois", back: "academy.html#play=c&s=x" });
    expect(readFlyNote("?fly=T2", s)).toBeNull();
    expect(readFlyNote("", s)).toBeNull();
    // never another site
    noteFly({ token: "T3", course: "c", step: "s", back: "https://example.com/x.html" }, s);
    expect(readFlyNote("?fly=T3", s)).toBeNull();
    s.setItem("ifr.fly.note", "{bad");
    expect(readFlyNote("?fly=T1", s)).toBeNull();
  });
  it("the loading card: « Briefing ✓ · Vol · Débriefing », a bar and « Annuler, revenir au cours »", async () => {
    const { readFileSync } = await import("fs");
    const cf = readFileSync("src/ui/courseFlight.ts", "utf8");
    expect(cf).toMatch(/L2\("Cancel, back to the course", "Annuler, revenir au cours"\)/);
    expect(cf).toMatch(/st\(L2\("Briefing", "Briefing"\), "done"\)/);
    expect(cf).toMatch(/st\(L2\("Debrief", "Débriefing"\), "next"\)/);
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toMatch(/courseUi\.setVeilNote\(note\)/);
    for (const f of ["src/course/ui/player.ts", "src/course/ui/slideTurn.ts"])
      expect(readFileSync(f, "utf8"), f).toMatch(/noteFly\(\{ token: hd\.token/);
  });
  it("the crosswind final flies the 240/20 its slide states, at 3,200 ft too", () => {
    const sc = mathsVfrScenes()["mv.xwind"];
    const w = sc.weather as unknown as { windDir: number; windKt: number; gustKt?: number; turbulence?: number; aloft?: { altFt: number; dir: number; kt: number }[] };
    expect(w.aloft?.length).toBeGreaterThan(0);
    const at = steadyWind({ windDir: w.windDir, windKt: w.windKt, gustKt: 0, turbulence: 0, aloft: w.aloft }, 3200, 3200 - 1150);
    expect(Math.round(at.dir)).toBe(240);
    expect(Math.round(at.kt)).toBe(20);
  });
});

describe("§17 Accueil does not boot the 3D world behind its cards", () => {
  it("the outside view boots once the cockpit is shown, never under Accueil or Simulateur", async () => {
    const { readFileSync } = await import("fs");
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toMatch(/const outsideWanted = \(\) => !intro\.isOpen && !fc\.isOpen;/);
    expect(main).toMatch(/requestAnimationFrame\(\(\) => setTimeout\(\(\) => \{ if \(outsideWanted\(\)\) void initOutside\(\); \}, 50\)\);/);
    // the frame loop asks for it the first time the page closes (and stops asking where WebGL is missing)
    expect(main).toMatch(/if \(!outside && !outsideLoading && !outsideQueued && !outsideFailed && !fc\.isOpen\) bootOutsideWhenIdle\(\);/);
    // the doors prefetch the course pages on the way to them
    expect(readFileSync("src/ui/home.ts", "utf8")).toMatch(/onpointerenter: \(\) => prefetchPage\(url\)/);
  });
});

describe("§18 §19 the Instructeurs page: own courses first, how it works instead of « bientôt », an explicit « Je suis instructeur »", () => {
  it("lists « Mes cours et brouillons » first and is titled « Enseigner avec Wingdeck »", async () => {
    const { SUBJECTS, programDef } = await import("../src/library/programs");
    const subs = SUBJECTS.filter((s) => s.program === "instructors").sort((a, b) => a.n.localeCompare(b.n));
    expect(subs.map((s) => s.id)).toEqual(["instructors.mine", "instructors.teach"]);
    expect(programDef("instructors").title.fr).toBe("Enseigner avec Wingdeck");
    expect(programDef("instructors").code.fr).toBe("Instructeurs");
  });
  it("draws the five steps, and the switch says who teaches (visiting the page alone turns nothing on)", async () => {
    const { readFileSync } = await import("fs");
    const lib = readFileSync("src/course/ui/library.ts", "utf8");
    expect(lib).toMatch(/if \(!s\.total && id === "instructors\.teach"\) \{\s*if \(!kinded\) secs\.push\(this\.teachGuide\(\)\);/);
    expect(lib).not.toMatch(/markTeaching\(\)/);
    const { lt } = await import("../src/library/strings");
    for (const k of ["teach1", "teach2", "teach3", "teach4", "teach5"] as const) {
      expect(lt(k, "fr") && lt(k, "en"), k).toBeTruthy();
      expect(lt(`${k}Sub`, "fr") && lt(`${k}Sub`, "en"), k).toBeTruthy();
    }
    expect(lt("teach5", "fr")).toBe("Les résultats restent sur l’appareil");
    expect(lt("teachSwitch", "fr")).toBe("Je suis instructeur");
    // a first visit starts with « Nouveau sur Wingdeck ? », and the link no longer promises « 1 minute »
    expect(lib).toMatch(/if \(newcomer && !cont\.length && !mine\) out\.unshift\(discover\);/);
    expect(lt("discover", "fr")).toBe("Découvrir Wingdeck");
  });
});

describe("§20 the product says what it is: the slide deck for aviation", () => {
  it("tagline, intro and the Accueil link", async () => {
    const { brandTagline } = await import("../src/brand");
    expect(brandTagline("fr")).toBe("Le deck de slides pour l’aviation");
    const { readFileSync } = await import("fs");
    const home = readFileSync("src/ui/home.ts", "utf8");
    expect(home).toMatch(/fr: "Découvrir Wingdeck",/);
    expect(home).not.toMatch(/· 1 min/);
    // the old launcher's English h1 is drawn only when it opens (never the first heading of Accueil)
    expect(readFileSync("src/ui/modals.ts", "utf8")).toMatch(/super\('Choose your flight'\);\s*\}\s*\/\*\*[^]*?open\(\) \{\s*this\.render\(\);\s*super\.open\(\);/);
  });
});

describe("§21 a course opened from a link keeps its author's formation and says who shared it", () => {
  it("« Partagé par Claire Martin · LAPL · PPL › … », not « Instructeurs › Mes cours et brouillons »", async () => {
    const { courseHomeLine } = await import("../src/course/ui/library");
    const { sampleCourse } = await import("../src/course/samples");
    const c = sampleCourse("sample-deck-standard-turn-scan")!;
    c.id = "mon-cours-virage";
    delete (c as { sample?: string }).sample;
    c.author = { name: "Claire Martin" };
    (c as { subject?: string }).subject = "ppl.bif";
    const line = courseHomeLine(c, "fr", undefined, true);
    expect(line).toMatch(/^Partagé par Claire Martin · LAPL · PPL › /);
    expect(line).not.toMatch(/Mes cours et brouillons/);
    // one of my own: no « Partagé par »
    expect(courseHomeLine(c, "fr")).not.toMatch(/Partagé par/);
    expect(courseHomeLine(c, "en", undefined, true)).toMatch(/^Shared by Claire Martin · /);
  });
});

describe("§23 « 12 Tour de piste » says a template exists, and « Nouveau cours » opens on it", () => {
  it("the PPL's first template is the circuit; the row names it for who teaches", async () => {
    const { startersFor } = await import("../src/course/ui/newCourse");
    expect(startersFor("ppl")[0].id).toBe("ppl-circuit");
    const { readFileSync } = await import("fs");
    const lib = readFileSync("src/course/ui/library.ts", "utf8");
    expect(lib).toMatch(/const SUBJECT_TEMPLATE: Partial<Record<string, LibStringKey>> = \{ "ppl\.circ": "soonCircuit" \};/);
    expect(lib).toMatch(/const tpl = create \? SUBJECT_TEMPLATE\[d\.id\] : undefined;/);
    const { lt } = await import("../src/library/strings");
    expect(lt("soonCircuit", "fr")).toBe("Un modèle existe : créez votre cours de tour de piste");
  });
});

describe("§26 no English in the French cockpit: the Commandes pop-over, Raccourcis, Manettes, the exercise toast", () => {
  it("the dialogs speak French when the UI does", async () => {
    const { readFileSync } = await import("fs");
    const m = readFileSync("src/ui/modals.ts", "utf8");
    for (const raw of ["'Re-scan'", "h('h3', {}, 'No controller detected')", "'Reset to defaults'),", "'Buttons — click a slot, then press the button')"])
      expect(m, raw).not.toContain(raw);
    expect(m).toMatch(/retitle\(this as unknown as \{ box: HTMLElement \}, 'Controllers', 'Manettes'\)/);
    expect(m).toMatch(/retitle\(this, 'Keyboard shortcuts', 'Raccourcis clavier'\)/);
    expect(m).toMatch(/\['Pitch \/ roll \(yoke\)', 'Tangage \/ roulis \(manche\)', '↑ ↓ ← →'\]/);
    // no third-party product names in the dialog
    expect(m).not.toMatch(/Works with Chrome, Edge and Firefox/);
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toMatch(/lx\(h\('span', \{\}\), label\), h\('kbd', \{\}, k\)\);/);
    for (const k of ["'Go-around': 'Remise de gaz'", "'All keyboard shortcuts': 'Tous les raccourcis clavier'"]) expect(main).toContain(k);
    expect(main).toMatch(/toast\(tr\('ex\.started', \{ title: exTitle\(run\.ex\) \}\), 'info'\);/);
  });
});

describe("§27 one meaning per word: « Prendre les commandes » starts, « Continuer » un-pauses, « Reprendre » goes back", () => {
  it("the briefing, the pause veil and the top bar", async () => {
    const { readFileSync } = await import("fs");
    const learn = readFileSync("src/ui/learn.ts", "utf8");
    expect(learn).toContain("'br.start': 'Prendre les commandes',");
    expect(learn).toContain("'br.start': 'Take the controls',");
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toContain("'tb.resume': 'Continuer',");
    expect(main).toContain("'tb.resumeTip': 'Continuer (Échap)',");
    expect(main).toContain("'tb.backCourse': 'Reprendre le cours',");
  });
});

describe("§30 Browser Back stays in the app: Accueil, Simulateur and the cockpit are history entries", () => {
  it("pushes the places the pilot goes to and #vol for the cockpit, and follows Back / Forward", async () => {
    const { readFileSync } = await import("fs");
    const fc = readFileSync("src/ui/flightcenter.ts", "utf8");
    expect(fc).toMatch(/if \(this\.placed\) window\.history\.pushState\(null, "", url\);\s*else window\.history\.replaceState\(null, "", url\);/);
    expect(fc).toMatch(/if \(was && !this\.leavingForTool && PLACE_HASH\.test\(location\.hash\)\)\s*window\.history\.pushState\(null, "", location\.pathname \+ location\.search \+ COCKPIT_HASH\);/);
    const { COCKPIT_HASH } = await import("../src/ui/flightcenter");
    expect(COCKPIT_HASH).toBe("#vol");
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toMatch(/else if \(location\.hash === COCKPIT_HASH && fc\.isOpen && flightUnderWay\(\)\) fc\.close\(\);/);
  });
});

describe("§34 §40 the player's words: « Retour à l’éditeur » in the preview, always « Suivant »", () => {
  it("the preview's way back names the editor, and Next keeps its name while a slide builds", async () => {
    expect(ps("backToEditing", "fr")).toBe("Retour à l’éditeur");
    expect(ps("backToEditing", "en")).toBe("Back to editing");
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/course/ui/player.ts", "utf8");
    expect(src).toMatch(/ps\(this\.o\.preview \? "backToEditing" : "library", lang\)/);
    expect(src).toMatch(/const nextB = btn\(\s*ps\("next", lang\),/);
    expect(src).not.toMatch(/ps\("showMore"/);
  });
});

describe("§41 one glossary (lane A): kinds, never « éléments »; « À vous » for every exercise", () => {
  it("the intro and the library count in kinds; the step kinds say « À vous »", async () => {
    const { kindLabel } = await import("../src/course/ui/reader");
    expect(kindLabel("try", "fr")).toBe("À vous");
    expect(kindLabel("tap", "en")).toBe("Your turn");
    const { INTRO_COPY } = await import("../src/ui/intro");
    for (const l of ["fr", "en"] as const) expect(JSON.stringify(INTRO_COPY[l])).not.toMatch(/éléments|"\{n\} items"/);
    const { readFileSync } = await import("fs");
    const lib = readFileSync("src/course/ui/library.ts", "utf8");
    expect(lib).toMatch(/this\.kindWords\(sh\.kinds\) \|\| ltN\("item1", "items", sh\.total, this\.lang\)/);
    expect(readFileSync("src/library/strings.ts", "utf8")).not.toMatch(/éléments différents/);
  });
});

describe("§43 one width, one gutter, one h1, one button height on Accueil and the library", () => {
  it("the tokens live in _base.css, both pages load them, and the pages use them", async () => {
    const { readFileSync } = await import("fs");
    const base = readFileSync("src/styles/_base.css", "utf8");
    for (const t of ["--page-max: 1200px;", "--gutter: clamp(16px, 4vw, 40px);", "--h1: 2.375rem;", "--btn-h: 44px;", "--radius-card: 14px;", ".page-head {"])
      expect(base, t).toContain(t);
    expect(readFileSync("src/ui/appBar.ts", "utf8")).toContain('import "../styles/_base.css";');
    const home = readFileSync("src/styles/home.css", "utf8");
    expect(home).toMatch(/max-width: calc\(var\(--page-max, 1200px\) \+ 2 \* var\(--wd-gutter\)\);/);
    expect(home).toMatch(/\.wd-h1 \{\s*font-size: var\(--h1, 2\.375rem\);/);
    expect(home).toMatch(/min-height: var\(--btn-h, 44px\);/);
    const lib = readFileSync("src/styles/library.css", "utf8");
    expect(lib).toMatch(/max-width: calc\(var\(--page-max, 1200px\) \+ 2 \* var\(--gutter, 40px\)\);/);
    expect(lib).toMatch(/\.lb-h1 \{\s*font-size: var\(--h1, 2\.375rem\);/);
    expect(readFileSync("src/styles/appbar.css", "utf8")).toMatch(/--wd-gutter: var\(--gutter, 40px\);/);
  });
});
