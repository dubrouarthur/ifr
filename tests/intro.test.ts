// The first-run start page (a scrolling product page that presents the whole platform) and the product's
// positioning copy: every slot in both languages, the real captures (alt text, intrinsic size, on disk, within the
// weight budget), the library counts in step with the live model, one filled button per screen, everything behind
// the page inert while it is open, the 3D world held back, no slide deck or carousel any more.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INTRO_COPY,
  INTRO_COUNTS,
  INTRO_LINKS,
  INTRO_PHOTO,
  INTRO_REFS,
  INTRO_SHOTS,
  INTRO_STEP_IDS,
  frTypo,
  inertOthers,
  introWanted,
  shotSrc,
  type IntroShot,
} from "../src/ui/intro";
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
import { SAMPLES, allSamples } from "../src/course/samples";
import { libraryEntries } from "../src/course/ui/library";
import { shelves } from "../src/library/model";
import { libraryItems } from "../src/library/sources";

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

describe("start page: words", () => {
  it("every slot has its French and English text, with the same shape", () => {
    expect(shape(INTRO_COPY.fr)).toEqual(shape(INTRO_COPY.en));
    for (const l of ["fr", "en"] as const)
      for (const [p, s] of strings(INTRO_COPY[l]))
        expect(s.trim(), `${l}${p}`).not.toBe("");
  });
  it("the words of the page (snapshot of the key slots)", () => {
    const { fr, en } = INTRO_COPY;
    expect([fr.start, en.start]).toEqual(["Commencer", "Start"]);
    // the app bar's word: Bibliothèque (one word per thing, UX logic §2)
    expect([fr.explore, en.explore]).toEqual([
      "Explorer la bibliothèque",
      "Explore the library",
    ]);
    // the bar's in-page anchors are section words, never the app's place names (they scroll, they do not go
    // there: one word per thing)
    expect([fr.navHow, fr.navWho, fr.navLib, fr.navSim]).toEqual([
      "Comment ça marche",
      "Pour qui",
      "Les formations",
      "Le simulateur intégré",
    ]);
    expect([en.navHow, en.navWho, en.navLib, en.navSim]).toEqual([
      "How it works",
      "Who it’s for",
      "The training",
      "The built-in simulator",
    ]);
    for (const l of ["fr", "en"] as const)
      for (const [, place] of INTRO_COPY[l].places)
        expect([INTRO_COPY[l].navLib, INTRO_COPY[l].navSim]).not.toContain(
          place,
        );
    // no overclaim: a flight simulator, not « a real one » (it is not certified), and live instruments
    for (const l of ["fr", "en"] as const)
      for (const [p, t] of strings(INTRO_COPY[l]))
        expect(/vrais? (simulateur|instruments)|real (simulator|instruments)/i.test(t), `${l}${p}`).toBe(false);
    // one eyebrow line, the same at every width
    expect(fr.eyebrow).toBe("Cours · Salle de classe · Simulateur de vol");
    expect(en.eyebrow).toBe("Courses · Classroom · Flight simulator");
    expect(fr.facts).toEqual([
      "Élèves, instructeurs et aéroclubs",
      "Du LAPL et du PPL à l’IR et à la théorie ATPL",
      "En français et en anglais",
    ]);
    // the five verbs of the route, in order, with who does each
    expect(fr.steps.map((s) => s.v)).toEqual([
      "Créer",
      "Enseigner",
      "Apprendre",
      "Voler",
      "Débriefer",
    ]);
    expect(en.steps.map((s) => s.v)).toEqual([
      "Create",
      "Teach",
      "Learn",
      "Fly",
      "Debrief",
    ]);
    expect(fr.steps.map((s) => s.role)).toEqual([
      "Instructeur",
      "Instructeur",
      "Élève",
      "Élève",
      "Élève et instructeur",
    ]);
    expect(INTRO_STEP_IDS).toHaveLength(5);
    // the three places of the app, named as the app bar names them
    expect(fr.places.map((p) => p[0])).toEqual([
      "Accueil",
      "Bibliothèque",
      "Simulateur",
    ]);
    expect(en.places.map((p) => p[0])).toEqual([
      "Home",
      "Library",
      "Simulator",
    ]);
    expect(fr.finH).toBe("Commencez par l’Accueil");
    expect(fr.skip).toBe("Ne plus afficher cette page au démarrage");
    expect(en.skip).toBe("Don’t show this page at start-up");
    // the honest note: procedure training, not a certified FSTD, explained in plain words next to it
    expect(fr.note).toBe("Entraînement procédural, non certifié FSTD");
    expect(en.note).toBe("Procedural training, not a certified FSTD");
    expect(fr.trNote[1]).toMatch(/pas un simulateur certifié.*ne comptent pas/);
    expect(en.trNote[1]).toMatch(/not a certified simulator.*not logged/);
    expect(fr.noteTip).toMatch(/FSTD/);
    // the simulator also works on its own
    expect(fr.alone[0]).toBe("Le simulateur fonctionne aussi seul.");
  });
  it("French typography: a no-break space before « : ; ? ! », never a plain one", () => {
    for (const [p, s] of strings(INTRO_COPY.fr))
      expect(/ [:;?!]/.test(s), p).toBe(false);
    expect(frTypo({ a: ["x : y ?"] })).toEqual({ a: ["x : y ?"] });
  });
  it("names no old place, no claim, no testimonial", () => {
    for (const l of ["fr", "en"] as const)
      for (const [p, s] of strings(INTRO_COPY[l])) {
        expect(s, p).not.toMatch(/Flight Center|Centre de vol|IFR Trainer/);
        expect(s, p).not.toMatch(
          /approuvé|homologué|approved|certified by|n°\s*1|★|testimonial|témoignage/i,
        );
      }
  });
  it("cites the library's references, FAA and EASA", () => {
    expect(INTRO_REFS.map((r) => `${r.org} ${r.docs}`)).toEqual([
      "FAA PHAK, AIM, IFH, ACS",
      "EASA Part-FCL, Part-NCO",
    ]);
  });
});

describe("start page: the real captures", () => {
  const keys = Object.keys(INTRO_SHOTS) as IntroShot[];
  const referenced = () => {
    const files = new Set<string>();
    for (const k of keys)
      for (const l of ["fr", "en"] as const) files.add(shotSrc(k, l));
    return [...files];
  };
  it("every picture has its alt text in both languages and its intrinsic size", () => {
    for (const k of keys) {
      const s = INTRO_SHOTS[k];
      for (const l of ["fr", "en"] as const)
        expect(s.alt[l].length, k).toBeGreaterThan(30);
      expect(s.alt.fr).not.toBe(s.alt.en);
      expect(s.size.fr[0] > 0 && s.size.fr[1] > 0, k).toBe(true);
    }
    expect(INTRO_PHOTO.alt.fr && INTRO_PHOTO.alt.en).toBeTruthy();
    // every <img> the page draws goes through the table (size + alt + lazy/eager), or is the final photo
    const src = SRC();
    const imgs = src.match(/h\(\s*"img"/g) ?? [];
    expect(imgs).toHaveLength(2);
    expect(src).toMatch(/alt: INTRO_SHOTS\[k\]\.alt\[l\]/);
    expect(src).toMatch(/alt: INTRO_PHOTO\.alt\[l\]/);
    // below the fold everything is lazy; only the hero's three screens load first
    expect(src).toMatch(/loading: eager \? "eager" : "lazy"/);
    expect(src.match(/shot\(k, "", true\)/g) ?? []).toHaveLength(1);
    expect(src.match(/heroShot\("/g) ?? []).toHaveLength(3);
  });
  it("each referenced capture exists on disk, with the size the page says, and the set stays under 1.5 MB", () => {
    let total = 0;
    for (const f of referenced()) {
      const p = join("public", f);
      expect(existsSync(p), p).toBe(true);
      total += statSync(p).size;
      // a WebP's VP8/VP8L/VP8X header carries its size: check it against the table (no layout shift)
      const b = readFileSync(p);
      expect(b.toString("ascii", 0, 4)).toBe("RIFF");
      expect(b.toString("ascii", 8, 12)).toBe("WEBP");
      const kind = b.toString("ascii", 12, 16);
      let w = 0;
      let hh = 0;
      if (kind === "VP8X") {
        w = 1 + b.readUIntLE(24, 3);
        hh = 1 + b.readUIntLE(27, 3);
      } else if (kind === "VP8 ") {
        w = b.readUInt16LE(26) & 0x3fff;
        hh = b.readUInt16LE(28) & 0x3fff;
      } else if (kind === "VP8L") {
        const v = b.readUInt32LE(21);
        w = (v & 0x3fff) + 1;
        hh = ((v >> 14) & 0x3fff) + 1;
      }
      const m = /landing\/(.+)-(fr|en)\.webp$/.exec(f)!;
      const s = INTRO_SHOTS[m[1] as IntroShot].size as Record<
        string,
        readonly [number, number] | undefined
      >;
      expect([w, hh], f).toEqual(s[m[2]]);
    }
    // the final card's photo lives in the same folder and counts in the same budget
    total += statSync(join("public", INTRO_PHOTO.src)).size;
    expect(total).toBeLessThan(1.5 * 1024 * 1024);
    // the folder holds only what the page uses (nothing shipped for nothing)
    const used = new Set(
      [...referenced(), INTRO_PHOTO.src].map((f) =>
        f.replace("img/landing/", ""),
      ),
    );
    for (const f of readdirSync("public/img/landing"))
      expect(used.has(f), f).toBe(true);
    expect(existsSync(join("public", INTRO_PHOTO.src))).toBe(true);
  });
  it("links nowhere outside the app; every deep link is one of the app's own routes", () => {
    const src = SRC();
    expect(src).not.toMatch(/https?:\/\//i);
    for (const href of Object.values(INTRO_LINKS))
      expect(href).toMatch(
        /^academy\.html#(library&p=(ppl|night|ir|atpl|club|instructors)|new)$/,
      );
  });
});

describe("start page: the library counts", () => {
  it("say what the library's landing shows (the live model)", () => {
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
    // the page prints the count it holds, never a number of its own
    expect(INTRO_COPY.fr.libP[0]).toBe(String(list.length));
  });
});

describe("start page: behaviour", () => {
  it("one filled button per screen: the hero's, the final card's, and the bar's only while neither shows", () => {
    const src = SRC();
    // three « Commencer »: the bar, the hero, the final card; nothing else is filled
    expect(src.match(/startBtn\("/g) ?? []).toHaveLength(3);
    expect(src.match(/btn-primary/g) ?? []).toHaveLength(1);
    // the bar's starts inert and hidden, and an observer shows it only while neither in-page one is on screen
    expect(src).toMatch(/barGo\.inert = true/);
    expect(src).toMatch(
      /const show = !\[\.\.\.vis\.values\(\)\]\.some\(Boolean\)/,
    );
    expect(src).toMatch(/barGo\.inert = !show/);
    expect(CSS()).toMatch(/\.intro \.intro-top-go\.intro-show \{/);
  });
  it("keyboard: Tab follows the page's order (the bar first); the first Tab lands on « Commencer »; Enter (off a control), Esc and F2 open Accueil", () => {
    const src = SRC();
    // the page opens with the hero title focused (tabindex -1): Tab reaches « Commencer », Shift+Tab the bar
    expect(src).toMatch(/h\("h1", \{ id: "intro-title", tabindex: -1 \}/);
    expect(src).toMatch(/setTimeout\(\(\) => this\.focusTitle\(\), 60\)/);
    // no custom order: Tab only wraps at the ends (focus never leaves the dialog)
    expect(src).not.toMatch(/this\.primary/);
    expect(src).toMatch(/else if \(!e\.shiftKey && i === f\.length - 1\) to = f\[0\]/);
    // the hero's route is a preview, not a second set of the five step links
    expect(src.match(/anchor\(\s*stepId\(i\)/g) ?? []).toHaveLength(1);
    expect(src).toMatch(
      /\(e\.key === "Enter" && !onControl\) \|\|\s*e\.key === "F2" \|\|\s*e\.key === "Escape"/,
    );
    expect(src).toMatch(
      /querySelectorAll<HTMLElement>\("a\[href\], button, input"\)/,
    );
    // in-page links scroll the page and never touch the URL (the app routes on its hash)
    expect(src).toMatch(/e\.preventDefault\(\);\s*this\.goTo\(id\)/);
  });
  it("the page is its own scroll container; motion only when welcome", () => {
    const css = CSS();
    expect(css).toMatch(
      /\.intro \{\s*position: fixed;\s*inset: 0;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/,
    );
    expect(css).toMatch(/\.intro \.intro-top \{\s*position: sticky;/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.intro \{\s*scroll-behavior: auto;/,
    );
    // the reveal and the hero's rise only run when the page set .intro-motion (no reduced motion)
    expect(css).not.toMatch(/(^|\n)\.intro \.intro-rv \{/);
    expect(css).toMatch(/\.intro\.intro-motion \.intro-rv \{/);
    expect(SRC()).toMatch(/matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
    // every rule is scoped: nothing outside .intro
    for (const sel of css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
      const s = sel[2].trim();
      if (/^(from|to|\d+%)$/.test(s)) continue;
      for (const one of s.split(/,(?![^(]*\))/))
        expect(one.trim(), one).toMatch(/^(:where\()?\.intro\b/);
    }
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
    // only what it changed is restored: an element inert before stays inert
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
  it("presents the platform, not one slide: no deck, no carousel, no autoplay", () => {
    const src = SRC();
    expect(src).not.toMatch(/deckStage|mountDeck|productDeck|INTRO_SLIDE/);
    expect(src).not.toMatch(/carousel|carrousel|setInterval|AUTO_MS|autoplay/i);
    // the seven parts, in reading order
    const order = [
      "intro-hero",
      "intro-how",
      "intro-who",
      "intro-lib",
      "intro-sim",
      "intro-tr-h",
      "intro-fin-h",
    ];
    const at = order.map((id) => src.indexOf(`"${id}"`));
    for (const i of at) expect(i).toBeGreaterThan(0);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // the start page's styles live in their own file
    expect(readFileSync("src/styles/ui-shell.css", "utf8")).not.toMatch(
      /\.intro-/,
    );
  });
  it("Accueil opens on what to do, not on the pitch again, and without the graduated edge", () => {
    const home = readFileSync("src/ui/home.ts", "utf8");
    expect(home).not.toMatch(
      /brandTagline|brandLead|brandEyebrow|brandAudience/,
    );
    // the no-break space before « ? », written as the character or as its escape
    expect(home).toMatch(/Que voulez-vous faire(?:\\u00a0| )\?/);
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
