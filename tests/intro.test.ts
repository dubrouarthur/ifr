// The first-run intro v2 (light chart-room variant) and the product's positioning copy: every slot in both
// languages, the five legs of the lesson flight plan, the only picture it loads, and the old slogan gone.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INTRO_COPY,
  INTRO_LEGS,
  INTRO_REFS,
  INTRO_SIM_IMG,
  introCaption,
  roseSvg,
} from "../src/ui/intro";
import { BRAND, brandAudience, brandEyebrow, brandKicker, brandLead, brandTagline } from "../src/brand";
import { productDeck } from "../src/course/samples/productDeck";

describe("positioning copy", () => {
  it("says what the product is, in both languages", () => {
    expect(brandTagline("fr")).toBe(
      "La plateforme de l’éducation aéronautique",
    );
    expect(brandTagline("en")).toBe("The platform for aviation education");
    expect(brandKicker("fr")).toBe("Éducation aéronautique");
    expect(brandKicker("en")).toBe("Aviation education");
    // one tool: a flight simulator and slides; build, teach, fly in the built-in simulator, which works on its own
    expect(brandLead("fr")).toMatch(
      /Un seul outil qui réunit un simulateur de vol et de belles diapositives.*créez vos cours.*enseignez-les en salle.*simulateur intégré, utilisable aussi seul/,
    );
    expect(brandLead("en")).toMatch(
      /One tool that unites a flight simulator and beautiful slides.*build courses.*teach them in class.*built-in simulator, which also works on its own/,
    );
    expect(brandEyebrow("fr")).toBe("Diapositives · Simulateur de vol");
    expect(brandEyebrow("en")).toBe("Slides · Flight simulator");
    // for every licence, not IFR only
    for (const l of ["fr", "en"] as const)
      for (const w of ["LAPL", "PPL", "IR", "ATPL"])
        expect(brandAudience(l)).toContain(w);
    expect(brandAudience("fr")).toMatch(/aéroclubs.*écoles de pilotage/);
    expect(brandAudience("en")).toMatch(/aeroclubs and flight schools/);
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

describe("intro v2", () => {
  it("every slot has its French and English text", () => {
    for (const [k, v] of Object.entries(INTRO_COPY)) {
      expect(v.fr, k).toBeTruthy();
      expect(v.en, k).toBeTruthy();
    }
    expect(INTRO_COPY.start).toEqual({ fr: "Commencer", en: "Start" });
    expect(INTRO_COPY.explore).toEqual({
      fr: "Explorer les cours",
      en: "Explore courses",
    });
    expect(INTRO_COPY.skip).toEqual({
      fr: "Ne plus afficher",
      en: "Don’t show again",
    });
    expect(INTRO_COPY.note.en).toBe("Procedure trainer, not a certified FSTD");
    expect(INTRO_COPY.note.fr).toBe(
      "Entraînement procédural, non certifié FSTD",
    );
  });
  it("the lesson as a flight plan: build, teach, brief, fly, debrief", () => {
    expect(INTRO_LEGS.map((l) => l.name.en)).toEqual([
      "Build",
      "Teach",
      "Brief",
      "Fly",
      "Debrief",
    ]);
    expect(INTRO_LEGS.map((l) => l.name.fr)).toEqual([
      "Créer",
      "Enseigner",
      "Briefer",
      "Voler",
      "Débriefer",
    ]);
    for (const l of INTRO_LEGS) expect(l.desc.fr && l.desc.en).toBeTruthy();
    expect(INTRO_REFS.map((r) => r.en)).toContain("FAA AIM");
  });
  it("loads one picture, our own rendered PFD, and links nowhere outside", () => {
    expect(INTRO_SIM_IMG).toBe("/img/glass.jpg");
    const src = readFileSync("src/ui/intro.ts", "utf8");
    expect(src).not.toMatch(/departure\.jpg|unsplash|https?:\/\//i);
    const credits = JSON.parse(
      readFileSync("public/img/credits.json", "utf8"),
    ) as unknown;
    expect(JSON.stringify(credits)).toContain("glass.jpg");
  });
  it("captions the live slide, and draws the compass card as linework only", () => {
    expect(introCaption(1, 5, "fr")).toBe("Diapositive 2 sur 5");
    expect(introCaption(1, 5, "en")).toBe("Slide 2 of 5");
    const svg = roseSvg();
    expect(svg).toContain("aria-hidden");
    expect((svg.match(/<line /g) ?? []).length).toBe(72);
    expect(svg).not.toMatch(/fill="#|stroke="#/); // colours come from the stylesheet
  });
  it("the product deck it plays names the product and makes no slogan claim", () => {
    const d = productDeck();
    const cover = JSON.stringify(d[0].slide);
    expect(cover).toContain(BRAND.name);
    expect(cover).not.toMatch(/come alive|diapositives vivantes/);
  });
});
