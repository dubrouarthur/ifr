// The first-run start page, centred on slides for aviation: every slot in both languages, one primary action
// (« Créer un cours »), the app's own routes only, the library counts in step with the live model, the live slides
// drawn by the slide renderer (no screenshot), lazy and still under reduced motion, one filled button per screen,
// everything behind the page inert while it is open, the 3D world held back.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INTRO_ACTIONS,
  INTRO_COPY,
  INTRO_COUNTS,
  INTRO_DECKS,
  INTRO_LINKS,
  INTRO_PROGS,
  deckLink,
  fill,
  frTypo,
  inertOthers,
  introWanted,
} from "../src/ui/intro";
import {
  INTRO_BEATS,
  INTRO_HERO,
  INTRO_HERO_SCENE,
  introBeatSlide,
  introHeroSlide,
  introScenes,
} from "../src/course/samples/introSlides";
import {
  brandAudience,
  brandEyebrow,
  brandLead,
  brandProgrammes,
  brandTagline,
  brandWho,
} from "../src/brand";
import { productDeck } from "../src/course/samples/productDeck";
import { CATEGORY_LABELS, libraryFor } from "../src/train/procedureLibrary";
import { SAMPLES, allSamples, sampleCourse } from "../src/course/samples";
import { DECKS } from "../src/course/samples/decks";
import { academyRoute, libraryEntries } from "../src/course/ui/library";
import { shelves } from "../src/library/model";
import { libraryItems } from "../src/library/sources";
import { stripShown } from "../src/course/canvas/controlStrip";
import { READ_FAILS, readIssueText, slideReadability } from "../src/course/canvas/readability";
import { resolveTheme } from "../src/course/canvas/themes";
import type { SlideBlock, SlideCanvas } from "../src/course/types";

const SRC = () => readFileSync("src/ui/intro.ts", "utf8");
const CSS = () => readFileSync("src/styles/ui-landing.css", "utf8");

describe("positioning copy", () => {
  it("says what the product is, in both languages", () => {
    expect(brandTagline("fr")).toBe(
      "La plateforme de l’éducation aéronautique",
    );
    expect(brandTagline("en")).toBe("The platform for aviation education");
    // who makes what: instructors create and teach, students learn, then practise in the simulator
    expect(brandLead("fr")).toBe(
      "Les instructeurs créent de beaux cours avec des instruments en direct et les présentent en salle. Les élèves les apprennent à leur rythme, puis les pratiquent dans le simulateur intégré, avec un résultat et un débriefing.",
    );
    expect(brandLead("en")).toBe(
      "Instructors build beautiful courses with live instruments and teach them in class. Students learn them at their own pace, then practise them in the built\u2011in\u00a0simulator, with a result and a debrief.",
    );
    // "volez-les" reads first as "steal them"
    expect(brandLead("fr")).not.toMatch(/volez/);
    expect(brandEyebrow("fr")).toBe("Diapositives · Simulateur de vol");
    expect(brandEyebrow("en")).toBe("Slides · Flight simulator");
    // for every licence, not IFR only
    for (const l of ["fr", "en"] as const)
      for (const w of ["LAPL", "PPL", "IR", "ATPL"])
        expect(brandAudience(l)).toContain(w);
    expect(brandAudience("fr")).toMatch(/aéroclubs.*écoles de pilotage/);
    expect(brandAudience("en")).toMatch(/aeroclubs and flight schools/);
    expect(brandWho("fr")).toBe("Élèves, instructeurs, aéroclubs, écoles");
    expect(brandWho("en")).toBe("Students, instructors, clubs, schools");
    expect(brandProgrammes("fr")).toBe("LAPL · PPL · IR · théorie ATPL");
    expect(brandProgrammes("en")).toBe("LAPL · PPL · IR · ATPL theory");
  });
  it("the old slogan is gone from the sources", () => {
    const old = [
      /Enseignez l’IFR avec des diapositives vivantes/,
      /Teach IFR with slides that come alive/,
    ];
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        return statSync(p).isDirectory()
          ? walk(p)
          : /\.(ts|html)$/.test(f)
            ? [p]
            : [];
      });
    for (const f of [...walk("src"), "index.html", "academy.html"]) {
      const s = readFileSync(f, "utf8");
      for (const re of old) expect(re.test(s), f).toBe(false);
    }
  });
});

/** every string of a value, with its path */
const strings = (o: unknown, path = ""): [string, string][] =>
  typeof o === "string"
    ? [[path, o]]
    : Array.isArray(o)
      ? o.flatMap((x, i) => strings(x, `${path}[${i}]`))
      : o && typeof o === "object"
        ? Object.entries(o).flatMap(([k, v]) => strings(v, `${path}.${k}`))
        : [];
/** the shape of a value (keys and array lengths, not the words) */
const shape = (o: unknown): unknown =>
  typeof o === "string"
    ? "s"
    : Array.isArray(o)
      ? o.map(shape)
      : o && typeof o === "object"
        ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)]))
        : o;

const inFrame = (s: SlideCanvas) =>
  s.blocks.every(
    (b) =>
      b.frame.x >= 0 &&
      b.frame.y >= 0 &&
      b.frame.x + b.frame.w <= 1920 &&
      b.frame.y + b.frame.h <= 1080,
  );
type Inst = Extract<SlideBlock, { kind: "instrument" }>;
const instruments = (s: SlideCanvas): Inst[] =>
  s.blocks.filter((b): b is Inst => b.kind === "instrument");
/** the situation ids a slide's instruments and views name */
const scenesOf = (s: SlideCanvas): string[] =>
  s.blocks.flatMap((b) =>
    (b.kind === "instrument" || b.kind === "simViewport") &&
    typeof (b as { scene?: unknown }).scene === "string"
      ? [(b as { scene: string }).scene]
      : [],
  );

describe("start page: words", () => {
  it("every slot has its French and English text, with the same shape", () => {
    expect(shape(INTRO_COPY.fr)).toEqual(shape(INTRO_COPY.en));
    for (const l of ["fr", "en"] as const)
      for (const [p, s] of strings(INTRO_COPY[l]))
        expect(s.trim(), `${l}${p}`).not.toBe("");
  });
  it("says in one line what Wingdeck is and for whom, centred on slides", () => {
    const { fr, en } = INTRO_COPY;
    expect([fr.eyebrow, en.eyebrow]).toEqual([
      "Diapositives pour l’aviation",
      "Slides for aviation",
    ]);
    expect([fr.h1, en.h1]).toEqual([
      "Des cours d’aviation qui volent",
      "Aviation courses that fly",
    ]);
    // create and share, slides, real aviation tools inside
    expect(fr.lead).toMatch(/^Créez et partagez vos cours en diapositives/);
    expect(fr.lead).toMatch(/instruments en direct, simulateur de vol, calculs/);
    expect(en.lead).toMatch(/^Build and share your courses as slides/);
    // for whom
    expect(fr.who).toMatch(/instructeurs.*aéroclubs.*écoles de pilotage.*élèves/);
    expect(en.who).toMatch(/instructors.*aeroclubs.*flight schools.*students/);
    // the actions, in the app's words
    expect([fr.create, en.create]).toEqual(["Créer un cours", "Create a course"]);
    expect([fr.discover, en.discover]).toEqual([
      "Découvrir les cours",
      "Explore the courses",
    ]);
    // the simulator is what makes the slides alive, not the product
    expect(fr.simDoor[0]).toBe("Le simulateur intégré donne vie à vos diapos.");
    expect(en.simDoor[0]).toBe("The built-in simulator brings your slides to life.");
    // the three beats: create, present and share (the studio's own buttons), fly
    expect(fr.beatsH).toBe("Créez. Partagez. Faites voler.");
    expect(en.beatsH).toBe("Create. Share. Fly.");
    expect(fr.beats.map((b) => b.h)).toEqual(["Créez", "Présentez, partagez", "Faites voler"]);
    expect(en.beats.map((b) => b.h)).toEqual(["Create", "Present, share", "Fly"]);
    expect(fr.beats[1].p).toMatch(/«\u00a0Présenter\u00a0».*«\u00a0Partager\u00a0»/);
    expect(en.beats[1].p).toMatch(/“Present”.*“Share”/);
    expect(fr.beats[2].p).toMatch(/^«\u00a0À vous\u00a0»/);
    // the AI assistant is a helper: a first draft, with the user's own key, nothing more
    expect(fr.ai[1]).toMatch(/premier jet.*votre propre clé API/);
    expect(en.ai[1]).toMatch(/drafts.*your own API key/);
    expect(fr.skip).toBe("Ne plus afficher cette page au démarrage");
    expect(en.skip).toBe("Don’t show this page at start-up");
    // the page can be found again, and says where
    expect(fr.again).toMatch(/Accueil.*«\u00a0Voir la présentation\u00a0»/);
    // the honest note
    expect(fr.note).toBe("Entraînement procédural, non certifié FSTD");
    expect(en.note).toBe("Procedural training, not a certified FSTD");
    expect(fr.noteTip).toMatch(/FSTD/);
  });
  it("is short: readable in five seconds", () => {
    for (const l of ["fr", "en"] as const) {
      const C = INTRO_COPY[l];
      expect(C.h1.split(" ").length, l).toBeLessThanOrEqual(6);
      expect(C.lead.length, l).toBeLessThan(160);
      expect(C.beats).toHaveLength(3);
      for (const b of C.beats) expect(b.p.length, b.h).toBeLessThan(170);
      // the whole page, every word of it, stays under ~1,800 characters
      const all = strings(C).map(([, s]) => s).join(" ");
      expect(all.length, l).toBeLessThan(1800);
    }
  });
  it("French typography: a no-break space before « : ; ? ! » and inside guillemets, never a plain one", () => {
    for (const [p, s] of strings(INTRO_COPY.fr))
      expect(/ [:;?!»]|« /.test(s), p).toBe(false);
    expect(frTypo({ a: ["x : y ?"] })).toEqual({ a: ["x\u00a0: y\u00a0?"] });
    expect(frTypo("« Voir »")).toBe("«\u00a0Voir\u00a0»");
  });
  it("no claim, no testimonial, no number of users, no brand, no PDF import", () => {
    for (const l of ["fr", "en"] as const)
      for (const [p, s] of strings(INTRO_COPY[l])) {
        expect(s, p).not.toMatch(/Flight Center|Centre de vol|IFR Trainer/);
        expect(s, p).not.toMatch(
          /approuvé|homologué|approved|certified by|n°\s*1|★|testimonial|témoignage|le meilleur|the best|utilisateurs|users|clients/i,
        );
        expect(s, p).not.toMatch(/Claude|Anthropic|OpenAI|Garmin|Cessna|PowerPoint|Keynote/);
        expect(s, p).not.toMatch(/PDF|import/i);
        // a flight simulator, not « a real one » (it is not certified)
        expect(/vrais? (simulateur|instruments)|real (simulator|instruments)/i.test(s), p).toBe(false);
      }
  });
});

describe("start page: the model (actions, links, counts)", () => {
  it("one primary action, « Créer un cours », to the new course page; the library second; the simulator a quiet door", () => {
    expect(INTRO_ACTIONS.primary).toBe("academy.html#new");
    expect(academyRoute(INTRO_ACTIONS.primary.split("#")[1]).k).toBe("new");
    expect(INTRO_ACTIONS.secondary).toBe("academy.html#library");
    expect(academyRoute(INTRO_ACTIONS.secondary.split("#")[1]).k).toBe("library");
    expect(INTRO_ACTIONS.tertiary).toBe("#simulateur");
    // the simulator door is a link inside a sentence, never a button
    const src = SRC();
    expect(src).toMatch(/INTRO_ACTIONS\.tertiary,\s*"door-a"/);
    // the filled button is drawn by one factory, used three times: the hero, the closing card, the bar
    expect(src.match(/btn-primary/g) ?? []).toHaveLength(1);
    expect(src.match(/createBtn\(/g) ?? []).toHaveLength(3);
    expect(src).toMatch(/const createBtn = \(cls = ""\) =>\s*out\(\s*INTRO_ACTIONS\.primary/);
  });
  it("links nowhere outside the app; every deep link is one of the app's own routes", () => {
    const src = SRC();
    expect(src).not.toMatch(/https?:\/\//i);
    for (const [k, href] of Object.entries(INTRO_LINKS))
      expect(href, k).toMatch(
        /^(academy\.html#(library(&p=(ppl|night|ir|atpl))?|new)|#simulateur)$/,
      );
    for (const p of INTRO_PROGS) {
      const r = academyRoute(INTRO_LINKS[p].split("#")[1]);
      expect(r, p).toMatchObject({ k: "library", p });
    }
  });
  it("the ready decks are the library's own decks, each playable by its link", () => {
    expect([...INTRO_DECKS]).toEqual(DECKS.map((d) => d.id));
    for (const id of INTRO_DECKS) {
      expect(academyRoute(deckLink(id).split("#")[1]), id).toEqual({ k: "play", id });
      const c = sampleCourse(id);
      expect(c, id).toBeTruthy();
      expect(c!.steps.some((s) => s.slide), id).toBe(true);
    }
    expect(fill(INTRO_COPY.fr.slidesN, 10)).toBe("10 diapos");
    expect(fill(INTRO_COPY.en.itemsN, 64)).toBe("64 items");
  });
  it("the library counts say what the library's landing shows (the live model)", () => {
    const list = libraryItems({
      lang: "fr",
      courses: libraryEntries({ samples: allSamples(), stored: [] }),
      sampleProgram: (id: string) => SAMPLES.find((s) => s.id === id)?.program,
      procedures: libraryFor("fr"),
      categories: CATEGORY_LABELS,
    });
    expect(INTRO_COUNTS.total).toBe(list.length);
    const sh = new Map(shelves(list).map((s) => [s.program, s]));
    for (const p of ["ppl", "night", "ir", "atpl"] as const) {
      const s = sh.get(p)!;
      expect(INTRO_COUNTS[p].n, p).toBe(s.total);
      expect(INTRO_COUNTS[p].s, p).toBe(
        s.groups.flatMap((g) => g.subjects).length,
      );
    }
    expect(INTRO_COUNTS.club.n).toBe(sh.get("club")!.total);
    // the page prints the counts it holds, never a number of its own
    const src = SRC();
    expect(src).toMatch(/fill\(C\.itemsN, INTRO_COUNTS\[p\]\.n\)/);
    expect(src).toMatch(/fill\(C\.itemsN, INTRO_COUNTS\.total\)/);
    expect(strings(INTRO_COPY).some(([, s]) => /\d{2,}/.test(s))).toBe(false);
  });
});

describe("start page: the live slides", () => {
  const scenes = introScenes();
  it("the hero is a real slide: the G1000 PFD live on its autopilot, its heading knob in the control strip", () => {
    const s = introHeroSlide();
    expect(inFrame(s)).toBe(true);
    const [pfd, ...others] = instruments(s);
    expect(others).toHaveLength(0);
    expect(pfd.view).toEqual({ kind: "pfd" });
    expect(pfd.mode).toBe("live");
    expect(pfd.controls).toEqual(["hdgBug"]);
    expect(stripShown(pfd)).not.toBeNull();
    expect(pfd.alt?.fr && pfd.alt.en).toBeTruthy();
    // every text in both languages
    for (const b of s.blocks)
      if (b.kind === "text") expect(b.text.fr && b.text.en, b.id).toBeTruthy();
    // its situation: the autopilot in HDG, the bug off the heading so the aircraft turns as the page opens …
    const sc = scenes[INTRO_HERO_SCENE];
    expect(sc.cockpit).toBe("g1000");
    expect(sc.ap).toMatchObject({ engaged: true, lat: "HDG", vert: "ALT", hdg: INTRO_HERO.bug });
    expect(INTRO_HERO.bug).not.toBe(INTRO_HERO.hdg);
    // … and with reduced motion the bug starts on the heading: nothing moves until the visitor turns the knob
    expect(introScenes(true)[INTRO_HERO_SCENE].ap?.hdg).toBe(INTRO_HERO.hdg);
  });
  for (const lang of ["fr", "en"] as const)
    it(`the hero slide passes the readability guard (${lang}): every text fits its box`, () => {
      const fails = slideReadability(introHeroSlide(), { theme: resolveTheme("classroom"), lang })
        .filter((i) => READ_FAILS.has(i.kind))
        .map((i) => `${i.blockId}: ${readIssueText(i, "en").en}`);
      expect(fails).toEqual([]);
    });
  it("three beats, each a ready slide that moves: a needle by itself, a template's cover, a student at the controls", () => {
    expect([...INTRO_BEATS]).toEqual(["create", "share", "fly"]);
    for (const id of INTRO_BEATS) {
      const s = introBeatSlide(id);
      expect(inFrame(s), id).toBe(true);
      for (const sc of scenesOf(s)) expect(scenes[sc], `${id} ${sc}`).toBeTruthy();
    }
    expect(instruments(introBeatSlide("create")).some((b) => b.motion)).toBe(true);
    expect(introBeatSlide("share").blocks.some((b) => b.kind === "simViewport")).toBe(true);
    // the student's slide keeps its control strip; its « À vous » (which needs the player around it) is off
    const fly = instruments(introBeatSlide("fly"));
    expect(fly.some((b) => stripShown(b) !== null)).toBe(true);
    expect(fly.some((b) => b.yourTurn)).toBe(false);
  });
  it("drawn by the slide renderer, loaded on demand, never a screenshot", () => {
    const src = SRC();
    expect(src).not.toMatch(/h\(\s*"img"/);
    expect(src).not.toMatch(/img\/landing|\.webp/);
    expect(existsSync("public/img/landing")).toBe(false);
    expect(src).toMatch(/renderSlide\(slide, host, \{\s*mode: "play"/);
    expect(src).toMatch(/renderThumb\(pick, thumb/);
    // the renderer and the slides come in their own chunk (a type import only at the top)
    expect(src).toMatch(/import\("\.\.\/course\/canvas\/render"\)/);
    expect(src).not.toMatch(/^import \{[^}]*\} from "\.\.\/course\//m);
  });
  it("fast: the hero first, the rest when it comes near; one loop; everything destroyed with the page", () => {
    const src = SRC();
    expect(src).toMatch(/play\(heroStage, I\.introHeroSlide\(\)/);
    expect(src).toMatch(/new IntersectionObserver\([\s\S]*?rootMargin: "50% 0px"/);
    expect(src).toMatch(/io\?\.unobserve\(e\.target\)/);
    expect(src).toMatch(/for \(const v of this\.views\) v\.destroy\(\);/);
    // a slide that loads after the page closed or changed language is dropped
    expect(src).toMatch(/if \(gen !== this\.gen \|\| !this\.isOpen\) return;/);
    // no timer of the page's own: the instruments run on the stage's one rAF loop, which stops off screen and while
    // the tab is hidden
    expect(src).not.toMatch(/setInterval|requestAnimationFrame\(\(\) => this\.tick/);
    const host = readFileSync("src/course/stage/host.ts", "utf8");
    expect(host).toMatch(/visibilitychange/);
  });
  it("reduced motion: still frames (the animations rest, the hero waits for the visitor)", () => {
    const src = SRC();
    expect(src).toMatch(/matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
    expect(src).toMatch(/I\.introScenes\(reduce\)/);
    expect(readFileSync("src/course/canvas/instruments.ts", "utf8")).toMatch(
      /reduced: rest === "start" && prefersReducedMotion\(\)/,
    );
  });
});

describe("start page: behaviour", () => {
  it("one filled button per screen: the hero's, the closing card's, and the bar's only while neither shows", () => {
    const src = SRC();
    expect(src).toMatch(/barGo\.inert = true/);
    expect(src).toMatch(
      /const show = !\[\.\.\.vis\.values\(\)\]\.some\(Boolean\)/,
    );
    expect(src).toMatch(/barGo\.inert = !show/);
    expect(CSS()).toMatch(/\.intro \.intro-top-go\.intro-show \{/);
  });
  it("keyboard: the title takes the focus, Tab wraps inside the page, Esc and F2 close it to Accueil, the slide's controls get their keys", () => {
    const src = SRC();
    expect(src).toMatch(/h\("h1", \{ id: "intro-title", tabindex: -1 \}/);
    expect(src).toMatch(/setTimeout\(\(\) => this\.focusTitle\(\), 60\)/);
    expect(src).toMatch(/else if \(!e\.shiftKey && i === f\.length - 1\) to = f\[0\]/);
    expect(src).toMatch(/e\.key === "F2" \|\| e\.key === "Escape"/);
    // a key on the page's own controls (the strip's knob) reaches them, then stops at the page
    expect(src).toMatch(/this\.el\.addEventListener\("keydown", \(e\) => e\.stopPropagation\(\)\)/);
    expect(src).toMatch(/if \(!inside\) e\.stopPropagation\(\);/);
    // « Passer » in the bar does what Esc does
    expect(src).toMatch(/class: cx\("skip-btn"\)[\s\S]{0,160}onclick: \(\) => this\.leave\(this\.hooks\.enter\)/);
    // the title is a landing spot: no ring on it, even against the app's !important ring
    expect(CSS()).toMatch(/#intro-title:focus-visible \{[^}]*box-shadow: none !important/);
  });
  it("can be skipped for good and found again", () => {
    const src = SRC();
    expect(src).toMatch(/store\.set\(INTRO_SKIP_KEY, \(e\.target as HTMLInputElement\)\.checked\)/);
    // Accueil and the library open it again
    expect(readFileSync("src/ui/flightcenter.ts", "utf8")).toMatch(/index\.html\?intro=1/);
    expect(readFileSync("src/course/ui/library.ts", "utf8")).toMatch(/\?intro=1/);
  });
  it("the page is its own scroll container; 44 px targets; motion only when welcome; every rule scoped", () => {
    const css = CSS();
    expect(css).toMatch(
      /\.intro \{\s*position: fixed;\s*inset: 0;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/,
    );
    expect(css).toMatch(/\.intro \.intro-top \{\s*position: sticky;/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.intro \{\s*scroll-behavior: auto;/,
    );
    expect(css).toMatch(/\.intro\.intro-motion \.intro-on \{/);
    expect(css).not.toMatch(/(^|\n)\.intro \.intro-on \{/);
    // every control of the page is at least 44 px high
    for (const sel of ["intro-btn-sm", "intro-lang button", "intro-skip-btn", "intro-door-a", "intro-prog", "intro-skip"]) {
      const i = css.indexOf(`.intro .${sel} {`);
      expect(i, sel).toBeGreaterThan(0);
      expect(css.slice(i, css.indexOf("}", i)), sel).toMatch(/min-height: 44px/);
    }
    for (const sel of css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
      const s = sel[2].trim();
      if (/^(from|to|\d+%)$/.test(s)) continue;
      for (const one of s.split(/,(?![^(]*\))/))
        expect(one.trim(), one).toMatch(/^(:where\()?\.intro\b/);
    }
    expect(readFileSync("src/styles/ui-shell.css", "utf8")).not.toMatch(
      /\.intro-/,
    );
  });
  it("shown once per session, never back from a course, forced by ?intro=1", () => {
    const loc = (search: string, hash = "") => ({ search, hash });
    expect(introWanted(loc("?intro=1"), { webdriver: true }, "", true)).toBe(
      true,
    );
    expect(introWanted(loc(""), {}, "", true)).toBe(false);
    expect(
      introWanted(loc(""), {}, "https://x/academy.html#play=a", false),
    ).toBe(false);
    expect(introWanted(loc("?intro=0"), {}, "", false)).toBe(false);
    expect(introWanted(loc("", "#circuit=abc"), {}, "", false)).toBe(false);
  });
  it("a real modal: everything behind it goes inert while it is open, and comes back as it was", () => {
    const page = { inert: false };
    const cockpit = { inert: false };
    const toast = { inert: false };
    const already = { inert: true };
    const undo = inertOthers([cockpit, page, toast, already], page);
    expect([cockpit.inert, page.inert, toast.inert, already.inert]).toEqual([
      true,
      false,
      true,
      true,
    ]);
    undo();
    expect([cockpit.inert, page.inert, toast.inert, already.inert]).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(SRC()).toMatch(
      /inertOthers\(\s*Array\.from\(document\.body\.children\)/,
    );
  });
  it("the 3D world does not boot while the page is up", () => {
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toMatch(/closed: \(\) => bootOutsideWhenIdle\(\)/);
    expect(main).toMatch(/if \(!intro\.isOpen\) void initOutside\(\)/);
  });
  it("Accueil opens on what to do, not on the pitch again", () => {
    const home = readFileSync("src/ui/home.ts", "utf8");
    expect(home).not.toMatch(
      /brandTagline|brandLead|brandEyebrow|brandAudience/,
    );
    expect(home).toMatch(/Que voulez-vous faire(?:\\u00a0| )\?/);
    expect(readFileSync("src/styles/ui-flightcenter.css", "utf8")).not.toMatch(
      /\.fc-sh::before/,
    );
  });
  it("the product deck (Accueil « Voir la présentation ») makes no slogan claim", () => {
    for (const s of productDeck())
      expect(JSON.stringify(s.slide)).not.toMatch(
        /come alive|diapositives vivantes/,
      );
  });
});
