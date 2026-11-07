// The first-run start page ("story": one reading order, one object, one action) and the product's positioning
// copy: every slot in both languages, the one still slide it shows (VFR, passive), no picture and no autoplay,
// everything behind it inert while it is open, the 3D world held back, the old page's parts and slogan gone.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INTRO_COPY,
  INTRO_REFS,
  INTRO_SLIDE,
  inertOthers,
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

describe("positioning copy", () => {
  it("says what the product is, in both languages", () => {
    expect(brandTagline("fr")).toBe(
      "La plateforme de l’éducation aéronautique",
    );
    expect(brandTagline("en")).toBe("The platform for aviation education");
    // one tool: slides and a flight simulator; build, teach, fly
    expect(brandLead("fr")).toBe(
      "Des diapositives et un simulateur\u00a0de\u00a0vol réunis\u00a0: créez vos cours, enseignez-les en salle, puis pratiquez-les au simulateur.",
    );
    expect(brandLead("en")).toBe(
      "Slides and a flight\u00a0simulator in one tool: build your courses, teach them in class, then fly them in the simulator.",
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
    // the start page says who, as people, then the programmes
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

describe("start page", () => {
  it("every slot has its French and English text (snapshot)", () => {
    for (const [k, v] of Object.entries(INTRO_COPY)) {
      expect(v.fr, k).toBeTruthy();
      expect(v.en, k).toBeTruthy();
    }
    expect(INTRO_COPY).toEqual({
      start: { fr: "Commencer", en: "Start" },
      explore: { fr: "Explorer les cours", en: "Explore courses" },
      skip: { fr: "Ne plus afficher", en: "Don’t show again" },
      refsLead: { fr: "Sources des cours\u00a0:", en: "Sources:" },
      note: {
        fr: "Entraînement procédural, non certifié FSTD",
        en: "Procedure trainer, not a certified FSTD",
      },
      deckLabel: {
        fr: "Une diapositive de cours : les arcs de l’anémomètre, avec l’instrument du simulateur",
        en: "A course slide: the airspeed indicator’s arcs, with the simulator’s own instrument",
      },
      langLabel: { fr: "Langue", en: "Language" },
      startTip: {
        fr: "Ouvrir le Flight Center : cours, leçons, vols et parcours (Entrée)",
        en: "Open the Flight Center: courses, lessons, flights and paths (Enter)",
      },
    });
  });
  it("shows one still slide of the product deck, for a PPL student", () => {
    expect(productDeck().map((s) => s.id)).toContain(INTRO_SLIDE);
    const src = readFileSync("src/ui/intro.ts", "utf8");
    // no carousel: no legs, no autoplay timer, no second frame
    expect(src).not.toMatch(/setTimeout\(\(\) => this\.advance|INTRO_LEGS|AUTO_MS|intro-leg|carousel|carrousel/);
    // the slide is a picture: inert, so no tab stop and no click inside it
    expect(src).toMatch(/class: "intro-stage",\s*inert: true/);
    expect(src).toMatch(/role: "img"/);
  });
  it("cites the library's references, FAA and EASA", () => {
    expect(INTRO_REFS.map((r) => `${r.org} ${r.docs}`)).toEqual([
      "FAA PHAK, AIM, IFH, ACS",
      "EASA Part-FCL, Part-NCO",
    ]);
  });
  it("loads no picture and links nowhere outside", () => {
    const src = readFileSync("src/ui/intro.ts", "utf8");
    expect(src).not.toMatch(/departure\.jpg|unsplash|https?:\/\//i);
    expect(src.match(/\/img\/[\w.-]+\.(?:jpe?g|png|webp|avif|gif|svg)/g) ?? []).toEqual([]);
  });
  it("a real modal: everything behind it goes inert while it is open, and comes back as it was", () => {
    const page = { inert: false };
    const cockpit = { inert: false };
    const toast = { inert: false };
    const already = { inert: true };
    const undo = inertOthers([cockpit, page, toast, already], page);
    expect([cockpit.inert, page.inert, toast.inert, already.inert]).toEqual([true, false, true, true]);
    undo();
    // only what it changed is restored: an element inert before stays inert
    expect([cockpit.inert, page.inert, toast.inert, already.inert]).toEqual([false, false, false, true]);
    const src = readFileSync("src/ui/intro.ts", "utf8");
    expect(src).toMatch(/inertOthers\(\s*Array\.from\(document\.body\.children\)/);
  });
  it("the 3D world does not boot while the page is up", () => {
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toMatch(/closed: \(\) => bootOutsideWhenIdle\(\)/);
    expect(main).toMatch(/if \(!intro\.isOpen\) void initOutside\(\)/);
  });
  it("the old page's parts are gone: no rose, no graduated neatline, no second screen, no key hint", () => {
    const src = readFileSync("src/ui/intro.ts", "utf8");
    const css = readFileSync("src/styles/ui-landing.css", "utf8");
    for (const s of [src, css])
      for (const gone of [
        "intro-scope",
        "intro-grad",
        "intro-rose",
        "is-sim\"",
        "intro-eyebrow",
        "intro-keys",
        "intro-fpl",
        "intro-leg",
        "is-pfd",
      ])
        expect(s.includes(gone), gone).toBe(false);
    expect(src).not.toMatch(/brandEyebrow|brandKicker|roseSvg|<kbd|"kbd"/);
    // the start page's styles live in their own file
    expect(readFileSync("src/styles/ui-shell.css", "utf8")).not.toMatch(/\.intro-/);
  });
  it("the Flight Center opens on what to do, not on the pitch again, and without the graduated edge", () => {
    const fc = readFileSync("src/ui/flightcenter.ts", "utf8");
    expect(fc).not.toMatch(/brandTagline|brandLead|brandEyebrow|brandAudience/);
    expect(fc).toContain("Que voulez-vous faire\\u00a0?");
    expect(readFileSync("src/styles/ui-flightcenter.css", "utf8")).not.toMatch(/\.fc-sh::before/);
  });
  it("the product deck it plays makes no slogan claim", () => {
    for (const s of productDeck())
      expect(JSON.stringify(s.slide)).not.toMatch(
        /come alive|diapositives vivantes/,
      );
  });
});
