// Sharing your own course (audit item 2, editor part): a course made from any template fits in a link, opens back
// identical, and the exported file is a « .wingdeck » named in the app's language.
import { describe, expect, it } from "vitest";
import { DECK_STARTERS } from "../src/course/ui/deckStarters";
import { buildNewCourse } from "../src/course/ui/newCourse";
import {
  courseFileName,
  decodeCourseShare,
  encodeCourseShare,
  FILE_EXT,
  usedSceneIds,
} from "../src/course/pack";
import { BLOCK_REF } from "../src/course/shareSlim";

const make = (i: number, title = "Mon cours") =>
  buildNewCourse({ id: "mon-cours", lang: "fr", title, program: null, subject: null, starter: DECK_STARTERS[i] });

describe("share links of template courses", () => {
  it("every template course fits in a short link and comes back identical", async () => {
    for (const [i] of DECK_STARTERS.entries()) {
      const c = make(i);
      const r = await encodeCourseShare(c);
      expect(r.fits, DECK_STARTERS[i].id).toBe(true);
      // far under the 8 KB limit, so the author can still write a lot before the link is too long
      expect(r.bytes, DECK_STARTERS[i].id).toBeLessThan(4000);
      const back = await decodeCourseShare(r.code);
      expect(back).toBeTruthy();
      expect(back!.steps).toEqual(c.steps);
      for (const id of usedSceneIds(c)) expect(back!.scenes[id]).toEqual(c.scenes[id]);
    }
  });
  it("leaves out the situations no slide uses", () => {
    const c = make(0);
    const used = usedSceneIds(c);
    expect(used.size).toBeGreaterThan(0);
    expect(used.size).toBeLessThan(Object.keys(c.scenes).length);
  });
  it("carries an edited block in full", async () => {
    const c = make(0);
    const s = c.steps[1].slide!;
    const t = s.blocks.find((b) => b.kind === "text")!;
    if (t.kind === "text") t.text = { en: "My own words", fr: "Mes propres mots" };
    const back = await decodeCourseShare((await encodeCourseShare(c)).code);
    const bt = back!.steps[1].slide!.blocks.find((b) => b.id === t.id)!;
    expect(bt.kind === "text" && bt.text.fr).toBe("Mes propres mots");
  });
  it("drops a block the app does not know rather than guessing it", async () => {
    const c = make(0);
    const r = await encodeCourseShare(c);
    const { b64ToBytes, fromB64url, decompress, compress, bytesToB64, toB64url } = await import("../src/course/pack");
    const json = JSON.parse(
      new TextDecoder().decode(await decompress(b64ToBytes(fromB64url(r.code.slice(3))), "deflate-raw")),
    );
    const blocks = json.steps[1].slide.blocks as Record<string, unknown>[];
    const at = blocks.findIndex((b) => typeof b[BLOCK_REF] === "string");
    expect(at).toBeGreaterThanOrEqual(0);
    blocks[at][BLOCK_REF] = "zzzzzz";
    const bytes = await compress(new TextEncoder().encode(JSON.stringify(json)), "deflate-raw");
    const back = await decodeCourseShare(`C1.${toB64url(bytesToB64(bytes))}`);
    expect(back).toBeTruthy();
    expect(back!.steps[1].slide!.blocks.length).toBe(blocks.length - 1);
  });
});

describe("course file name", () => {
  it("is a .wingdeck named in the app's language", () => {
    const c = make(0, "Le tour de piste");
    expect(FILE_EXT).toBe(".wingdeck");
    expect(courseFileName(c, "fr")).toBe("le-tour-de-piste.wingdeck");
    c.title = { en: "The circuit", fr: "Le tour de piste" };
    expect(courseFileName(c, "en")).toBe("the-circuit.wingdeck");
  });
});

describe("« Choisir plus tard » (audit item 3, new-course part)", () => {
  it("saves the course with no formation and no subject", () => {
    const c = make(0);
    expect(c.program).toBeUndefined();
    expect(c.subject).toBeUndefined();
  });
  it("keeps the formation but files no subject when only the subject is left for later", () => {
    const c = buildNewCourse({ id: "x", lang: "fr", title: "", program: "ppl", subject: null, starter: DECK_STARTERS[0] });
    expect(c.program).toBe("lapl-ppl");
    expect(c.subject).toBeUndefined();
  });
});
