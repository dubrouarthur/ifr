// Journey review (student, instructor, club president): what the first-sight test found in the app pages, kept
// fixed. A student sees no authoring action; « Présenter un cours existant » opens the picker at once; a course's
// context line agrees with its way back; a tool that cannot work is not offered; the exercise counter counts the
// rows it sits under; the stage places its instrument again when the bars around it change; light cards everywhere.
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { academyHash, academyRoute, courseHomeLine } from "../src/course/ui/library";
import { sampleCourse } from "../src/course/samples";
import { isTeaching, markTeaching, setTeaching } from "../src/library/role";
import { HOME_LINKS } from "../src/ui/home";

const read = (p: string) => readFileSync(p, "utf8");
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe("students and instructors", () => {
  it("a browser teaches only once it has opened a teaching place", () => {
    expect(isTeaching()).toBe(false);
    markTeaching();
    expect(isTeaching()).toBe(true);
    // « Je suis instructeur » off again
    setTeaching(false);
    expect(isTeaching()).toBe(false);
    setTeaching(true);
    expect(isTeaching()).toBe(true);
  });
  it("the library shows authoring actions to who teaches, never to a student", () => {
    const src = read("src/course/ui/library.ts");
    // « Créer un cours ici » on an empty subject; the card's « … » menu is for everyone (Ouvrir · Présenter · Copier
    // le lien, audit §18) and its authoring actions (Dupliquer pour modifier, Exporter) only for who teaches
    expect(src).toMatch(/const create = !own && d\.program !== "instructors" && this\.teaching;/);
    expect(src).toMatch(/const teach = this\.teaching;/);
    expect(src).toMatch(/if \(this\.store && teach\)\s*items\.push\(\[\s*e\.sample \? this\.t\("duplicateEdit"\)/);
    expect(src).toMatch(/if \(teach\) items\.push\(\[this\.t\("export"\)/);
    // who teaches says so: « Je suis instructeur » on the Instructeurs page (visiting it alone turns nothing on,
    // audit §18), or a teaching place: Nouveau cours, the editor, the presenter
    expect(src).not.toMatch(/if \(p === "instructors"\) markTeaching\(\);/);
    expect(src).toMatch(/role: "switch",\s*checked: isTeaching\(\),/);
    expect(src).toMatch(/setTeaching\(\(e\.target as HTMLInputElement\)\.checked\);/);
    expect(read("src/learn/main.ts")).toMatch(/r\.k === "edit" \|\| r\.k === "present" \|\| r\.k === "new"\) markTeaching\(\)/);
  });
  it("the slide import is offered only when this build ships it", () => {
    const src = read("src/course/ui/library.ts");
    expect(src).toMatch(/\.\.\.\(this\.o\.importPdf\s*\?\s*\[tool\("pdf", "toolPdf", "toolPdfSub"/);
    // and nothing promises it elsewhere
    for (const f of ["src/library/programs.ts", "src/ui/intro.ts"])
      expect(read(f), f).not.toMatch(/import de diapositives|importing your slides/);
    expect(read("src/library/strings.ts")).not.toMatch(/\.ifrcourse/);
  });
});

describe("« Présenter un cours existant »", () => {
  it("opens the Instructeurs page with the course picker, and the address forgets the request", () => {
    expect(HOME_LINKS.present).toBe("academy.html#library&p=instructors&do=present");
    const r = academyRoute("#library&p=instructors&do=present");
    expect(r).toEqual({ k: "library", p: "instructors", do: "present" });
    expect(academyHash(r)).toBe("#library&p=instructors");
    // asked while the library is already open, the page is drawn again with the picker
    expect(read("src/learn/main.ts")).toMatch(/const ask = r\.k === "library" && r\.do === "present";/);
  });
});

describe("the course player", () => {
  it("the context line names the formation the student came from", () => {
    const vor = sampleCourse("sample-vor")!;
    expect(courseHomeLine(vor, "fr")).toMatch(/^IR › /);
    expect(courseHomeLine(vor, "fr", "ppl")).toMatch(/^LAPL · PPL › /);
    // a formation that does not hold the course changes nothing
    expect(courseHomeLine(vor, "fr", "club")).toBe(courseHomeLine(vor, "fr"));
  });
  it("the exercise counter counts every row of the list above it", () => {
    const src = read("src/course/ui/player.ts");
    const fn = src.slice(src.indexOf("private doneText()"), src.indexOf("private doneText()") + 700);
    expect(fn).toMatch(/const rows = g\.rows;/);
    expect(fn).not.toMatch(/g\.rows\.filter\(\(r\) => r\.check >= 0\);/);
  });
  it("the stage places its panes again when the bars around them change", () => {
    const src = read("src/course/stage/frame.ts");
    expect(src).toMatch(/this\.syncChrome\(\);\s*this\.relayout\(\);/);
    expect(src).toMatch(/requestAnimationFrame\(place\)/);
  });
  it("diagram handles show the keyboard focus; top-view labels and chips are readable", () => {
    const css = read("src/styles/course-stage.css");
    expect(css).toMatch(/\.cs-handle:focus-visible \{\s*outline: 3px solid/);
    expect(css).not.toMatch(/font: 600 (9|10|11)px var\(--cs-(font|mono)\)/);
    // the top view's labels keep 12 px on screen whatever the inset's width (a tablet draws it narrower)
    expect(css).toMatch(/\.cs-plan-t \{[^}]*calc\(12px \* var\(--plan-k/);
    expect(read("src/course/stage/planInset.ts")).toMatch(/setProperty\("--plan-k"/);
    // the information line is plain text, not a fourth button style
    const assist = css.slice(css.indexOf(".cs-assist {"), css.indexOf("}", css.indexOf(".cs-assist {")));
    expect(assist).not.toMatch(/border:|background:/);
  });
});

describe("light cards, drawn covers", () => {
  it("the night rating's card is light like the others (dark is for instruments)", () => {
    // (the start page no longer draws formation cards: it links to the formations by name and count)
    expect(read("src/styles/ui-landing.css")).not.toMatch(/prog-night/);
    for (const f of ["src/styles/library.css"]) {
      const css = read(f);
      const i = css.search(/prog-night \.(lb|intro)-pc-top \{/);
      expect(i, f).toBeGreaterThan(0);
      expect(css.slice(i, i + 160), f).not.toMatch(/#1d2633|color: #fff/);
    }
  });
  it("each engine drill has its own cover", () => {
    const src = read("src/library/covers.ts");
    for (const id of ["d-efato", "d-forced-landing", "d-rough", "d-club-test"])
      expect(src, id).toMatch(new RegExp(`"${id}": "`));
  });
});

describe("small things a first visit trips on", () => {
  it("the search field is a 44 px target on a touch screen", () => {
    const css = read("src/styles/appbar.css");
    const i = css.indexOf("@media (pointer: coarse)");
    expect(css.slice(i, i + 400)).toMatch(/\.wd-search \{\s*height: 46px;/);
  });
  it("« Terminer et débriefer » shows no key: Shift+D opens the debrief without ending the flight", () => {
    const src = read("src/main.ts");
    expect(src).not.toMatch(/'End and debrief', 'Shift D'/);
    expect(src).toMatch(/'Shift N': 'Maj N'/);
  });
  it("the start page names the clubs it is for, and promises nothing about their results it does not show", () => {
    const src = read("src/ui/intro.ts");
    // the start page is about slides now (« Des cours d'aviation qui volent »): it names the aeroclubs among those it
    // is for; where a club's results live is said on the Club page, not promised on the way in
    expect(src).toMatch(/Pour les instructeurs, les aéroclubs, les écoles de pilotage et leurs élèves/);
    expect(src).toMatch(/For instructors, aeroclubs, flight schools and their students/);
    expect(src).not.toMatch(/résultats de chaque élève|each student’s results/i);
  });
  it("one French word for trimming in the briefing and the result: « compenser »", () => {
    for (const f of ["src/lesson/briefingDeck.ts", "src/ui/result/i18n.ts"]) expect(read(f), f).not.toMatch(/[Tt]rimez/);
  });
});
