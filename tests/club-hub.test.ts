// Club hub (procedures mode in the Flight Center): results aggregation and CSV, import report, and the procedure
// editor's pure model (draft -> Procedure, validation, preview, grading summary).
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size;
    },
  } as Storage;
});
beforeEach(() => mem.clear());

const fc = () => import("../src/ui/flightcenter");
const ed = () => import("../src/ui/procedureEditor");
const i18n = () => import("../src/ui/i18n");
// the Flight Center pulls in the whole navigation data: load it once, with time to spare on a busy machine
beforeAll(async () => {
  await Promise.all([fc(), ed()]);
}, 120_000);

type AnyAttempt = import("../src/ui/history").Attempt & {
  procedures?: unknown[];
};
const attempt = (
  id: string,
  date: string,
  student: string,
  procs?: unknown[],
  over: Partial<AnyAttempt> = {},
): AnyAttempt => ({
  id,
  date,
  student,
  scenario: `Drill ${id}`,
  approach: "",
  mode: "training",
  score: 80,
  grade: "B",
  acs: "",
  failedTasks: [],
  failures: [],
  durationSec: 600,
  ...(procs ? { procedures: procs } : {}),
  ...over,
});
const result = (
  id: string,
  score: number,
  verdict: "PASS" | "FAIL",
  reactionS: number | null,
  note = "",
  mode?: "training" | "test",
) => ({
  procedureId: id,
  title: `Proc ${id}`,
  failure: "engine",
  failedAtS: 100,
  reactionS,
  items: [],
  path: { iasBandPct: 80, maxBankDeg: 20, altLostFt: 500 },
  outcome: "completed",
  score,
  verdict,
  notes: note ? [note, "second"] : [],
  ...(mode ? { mode } : {}),
});

describe("results aggregation", () => {
  it("lists one row per procedure, newest first, and skips flights without procedures", async () => {
    const { procedureRows } = await fc();
    const rows = procedureRows([
      attempt("a", "2026-10-01T10:00:00Z", "Ann", [
        result("p1", 80, "PASS", 2),
      ]),
      attempt("b", "2026-10-03T10:00:00Z", " Bob ", [
        result("p1", 50, "FAIL", 9, "Mixture was late"),
        result("p2", 90, "PASS", null, "", "test"),
      ]),
      attempt("c", "2026-10-02T10:00:00Z", "Ann"),
      attempt(
        "d",
        "2026-10-04T10:00:00Z",
        "Ann",
        [result("p3", 70, "PASS", 3)],
        { mode: "checkride", exerciseTitle: "Lesson X" },
      ),
    ]);
    expect(rows.map((r) => `${r.attemptId}:${r.procedureId}`)).toEqual([
      "d:p3",
      "b:p1",
      "b:p2",
      "a:p1",
    ]);
    const b1 = rows[1];
    expect(b1.student).toBe("Bob");
    expect(b1.note).toBe("Mixture was late");
    // every debrief point is kept for the Results table (the first one is the most important)
    expect(b1.notes).toEqual(["Mixture was late", "second"]);
    expect(rows[2].notes).toEqual([]);
    expect(b1.drill).toBe("Drill b");
    expect(b1.mode).toBe("training");
    expect(rows[2].mode).toBe("test");
    expect(rows[2].reactionS).toBeNull();
    // no mode on the result: a checkride flight is a test, its lesson title names the drill
    expect(rows[0].mode).toBe("test");
    expect(rows[0].drill).toBe("Lesson X");
  });

  it("filters by student, verdict and words; lists the students", async () => {
    const { procedureRows, filterProcRows, studentsOf } = await fc();
    const rows = procedureRows([
      attempt("a", "2026-10-01T10:00:00Z", "Ann", [
        result("p1", 80, "PASS", 2),
      ]),
      attempt("b", "2026-10-03T10:00:00Z", "Bob", [
        result("p1", 50, "FAIL", 9),
        result("p2", 90, "PASS", 4),
      ]),
      attempt("c", "2026-10-02T10:00:00Z", "", [result("p2", 40, "FAIL", 12)]),
    ]);
    expect(studentsOf(rows)).toEqual(["", "Ann", "Bob"]);
    expect(filterProcRows(rows, { student: "Bob" })).toHaveLength(2);
    expect(
      filterProcRows(rows, { verdict: "FAIL" }).map((r) => r.attemptId),
    ).toEqual(["b", "c"]);
    expect(filterProcRows(rows, { q: "proc p2 bob" })).toHaveLength(1);
    expect(filterProcRows(rows, {})).toHaveLength(4);
  });

  it("summarises pass rate, average, median reaction and the weakest procedure first", async () => {
    const { procedureRows, procSummary } = await fc();
    const rows = procedureRows([
      attempt("a", "2026-10-01T10:00:00Z", "Ann", [
        result("p1", 80, "PASS", 2),
      ]),
      attempt("b", "2026-10-03T10:00:00Z", "Bob", [
        result("p1", 50, "FAIL", 9),
        result("p2", 90, "PASS", 4),
      ]),
      attempt("c", "2026-10-02T10:00:00Z", "Cy", [
        result("p2", 41, "FAIL", null),
      ]),
    ]);
    const s = procSummary(rows);
    expect(s.n).toBe(4);
    expect(s.pass).toBe(2);
    expect(s.passRate).toBe(50);
    expect(s.avgScore).toBe(65); // (80 + 50 + 90 + 41) / 4 = 65.25
    expect(s.reactionS).toBe(4); // median of 2, 4, 9
    // p1 and p2 both 1 of 2 passed: the lower average (p1 65 < p2 66) comes first
    expect(s.byProcedure.map((p) => p.procedureId)).toEqual(["p1", "p2"]);
  });

  it("is empty-safe", async () => {
    const { procedureRows, procSummary } = await fc();
    expect(procedureRows([])).toEqual([]);
    const s = procSummary([]);
    expect(s.passRate).toBeNull();
    expect(s.avgScore).toBeNull();
    expect(s.reactionS).toBeNull();
    expect(s.byProcedure).toEqual([]);
  });
});

describe("results CSV", () => {
  it("has a header and one quoted row per procedure attempt", async () => {
    const { procedureRows, procCsv } = await fc();
    const rows = procedureRows([
      attempt("a", "2026-10-01T10:00:00Z", 'Ann "Ace", Jr', [
        result("p1", 80, "PASS", 2.26, 'Flaps, then the "mixture"'),
      ]),
      attempt("b", "2026-10-03T10:00:00Z", "Bob", [
        result("p2", 50, "FAIL", null),
      ]),
    ]);
    const lines = procCsv(rows).split("\n");
    expect(lines[0]).toBe(
      "date,student,drill,procedure,procedure_id,failure,mode,score,verdict,reaction_s,outcome,main_point",
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('"Ann ""Ace"", Jr"');
    expect(lines[2]).toContain('"Flaps, then the ""mixture"""');
    expect(lines[2]).toContain('"2.3"');
    expect(lines[1]).toContain('"Bob"');
    expect(lines[1]).toContain('"FAIL"');
    // a missing reaction is an empty cell, not 'null'
    expect(lines[1]).not.toContain("null");
  });
});

describe("import report", () => {
  it("says what was added, updated and skipped, in plain words", async () => {
    const { importSummary } = await fc();
    const { setLang } = await i18n();
    setLang("en");
    const r = importSummary({
      added: ["a"],
      replaced: ["b", "c"],
      renamed: [],
      skipped: [{ id: "x", reason: "same as the library" }],
      issues: [],
    });
    expect(r.ok).toBe(true);
    expect(r.lines).toEqual([
      "1 procedure added",
      "2 procedures updated",
      "x: not imported (same as the library)",
    ]);
    setLang("fr");
    const f = importSummary({
      added: [],
      replaced: [],
      renamed: [],
      skipped: [],
      issues: ["Lien de partage invalide"],
    });
    expect(f.ok).toBe(false);
    expect(f.lines).toEqual(["Lien de partage invalide"]);
    expect(
      importSummary({
        added: [],
        replaced: [],
        renamed: [],
        skipped: [],
        issues: [],
      }).lines,
    ).toEqual(["Rien à importer"]);
    setLang("en");
  });
});

describe("share links", () => {
  it("describes what a link holds before importing it, and flags a damaged one", async () => {
    const { shareSummary } = await fc();
    const { setLang } = await i18n();
    const store = await import("../src/train/procedureStore");
    setLang("en");
    const p = store.customise("c172.alternator.en")!;
    p.title = "Alternator failure — club SOP";
    const one = shareSummary(store.shareLink(p, "https://club.example/"));
    expect(one.ok).toBe(true);
    expect(one.title).toBe("Procedure “Alternator failure — club SOP”");
    expect(one.procs).toEqual([{ title: p.title, items: p.items.length }]);
    const q = store.customise("c172.vacuum.en")!;
    const pack = shareSummary(
      store.encodeShare({ format: "ifr-club-pack", version: 1, club: "Aéroclub de Toussus", procedures: [p, q] }),
    );
    expect(pack.title).toBe("2 procedures shared by Aéroclub de Toussus");
    expect(pack.procs.map((x) => x.title)).toEqual([p.title, q.title]);
    setLang("fr");
    const anon = shareSummary(store.encodeShare({ format: "ifr-club-pack", version: 1, club: "", procedures: [q] }));
    expect(anon.title).toBe("1 procédure partagée par un autre club");
    const bad = shareSummary("P1.not-a-real-code");
    expect(bad.ok).toBe(false);
    expect(bad.procs).toEqual([]);
    setLang("en");
  });
});

describe("plural strings", () => {
  it("uses the singular form for 1 (and 0 in French)", async () => {
    const { tn, setLang, registerStrings } = await i18n();
    registerStrings("en", { "x.n": "{n} items", "x.n.1": "{n} item" });
    registerStrings("fr", { "x.n": "{n} points", "x.n.1": "{n} point" });
    setLang("en");
    expect(tn("x.n", 1)).toBe("1 item");
    expect(tn("x.n", 0)).toBe("0 items");
    expect(tn("x.n", 3)).toBe("3 items");
    setLang("fr");
    expect(tn("x.n", 0)).toBe("0 point");
    expect(tn("x.n", 2)).toBe("2 points");
    setLang("en");
  });
});

describe("procedure editor model", () => {
  it("adds, duplicates, moves and removes items with unique ids", async () => {
    const { addItem, duplicateItem, moveItem, removeItem } = await ed();
    const { newProcedure } = await import("../src/train/procedureStore");
    const p = newProcedure("en");
    p.items[0].text = "A";
    const i = addItem(p);
    p.items[i].text = "B";
    expect(p.items.map((x) => x.text)).toEqual(["A", "B"]);
    const d = duplicateItem(p, 0);
    expect(d).toBe(1);
    expect(p.items.map((x) => x.text)).toEqual(["A", "A", "B"]);
    expect(new Set(p.items.map((x) => x.id)).size).toBe(3);
    expect(moveItem(p, 2, -1)).toBe(1);
    expect(p.items.map((x) => x.text)).toEqual(["A", "B", "A"]);
    expect(moveItem(p, 0, -1)).toBe(0); // already first
    expect(moveItem(p, 2, 1)).toBe(2); // already last
    addItem(p, 0); // after the first
    expect(p.items[1].text).toBe("");
    removeItem(p, 1);
    expect(p.items.map((x) => x.text)).toEqual(["A", "B", "A"]);
  });

  it("changes checks with the catalogue's defaults and keeps switch values consistent", async () => {
    const { setItemCheck, setCheckParam, visibleParams } = await ed();
    const it: import("../src/train/procedureTypes").ProcItem = {
      id: "i1",
      text: "",
      memory: false,
      check: { id: "manual" },
    };
    setItemCheck(it, "ias");
    expect(it.check).toEqual({ id: "ias", p: { min: 63, max: 73 } });
    setItemCheck(it, "switch");
    expect(it.check?.id).toBe("switch");
    setCheckParam(it, "key", "mixture");
    expect(visibleParams(it).map((x) => x.name)).toContain("op");
    setCheckParam(it, "op", "<=");
    setCheckParam(it, "value", 0);
    // another control: its own default position, and the mixture-only 'op' goes
    setCheckParam(it, "key", "fuelSelector");
    expect(it.check?.p?.op).toBeUndefined();
    expect(["BOTH", "LEFT", "RIGHT", "LEFT|RIGHT", "OFF"]).toContain(
      it.check?.p?.value,
    );
    expect(visibleParams(it).map((x) => x.name)).toEqual(["key", "value"]);
    setCheckParam(it, "value", undefined);
    expect(it.check?.p && "value" in it.check.p).toBe(false);
  });

  it("cleans a draft into a valid procedure and explains what is wrong", async () => {
    const { cleanDraft, editorIssues, issuesAt } = await ed();
    const { newProcedure, validateProcedure } =
      await import("../src/train/procedureStore");
    const p = newProcedure("en");
    expect(
      issuesAt(editorIssues(p, "en"), "items[0]").map((i) => i.path),
    ).toEqual(["items[0].text"]);
    p.title = "   ";
    p.targets = { iasKt: [80, 70] };
    const issues = editorIssues(p, "en");
    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["title", "items[0].text", "targets.iasKt"]),
    );
    expect(issues.find((i) => i.path === "title")?.message).toBe(
      "Give the procedure a title",
    );
    expect(editorIssues(p, "fr").find((i) => i.path === "title")?.message).toBe(
      "Donnez un titre à la procédure",
    );

    p.title = "  Door open in flight ";
    p.targets = { iasKt: [65, 75] };
    p.ref = "  ";
    p.items[0] = {
      id: "i1",
      text: " Fly the aircraft ",
      memory: false,
      note: "  ",
      check: {
        id: "switch",
        p: { key: "fuelSelector", value: "BOTH", op: "<=" },
      },
    };
    p.failures = ["door", "door"];
    const c = cleanDraft(p);
    expect(c.title).toBe("Door open in flight");
    expect(c.ref).toBeUndefined();
    expect(c.items[0].text).toBe("Fly the aircraft");
    expect(c.items[0].note).toBeUndefined();
    expect(c.items[0].check).toEqual({
      id: "switch",
      p: { key: "fuelSelector", value: "BOTH" },
    });
    expect(c.failures).toEqual(["door"]);
    expect(c.source).toBe("club");
    expect(c.disclaimer).toMatch(/POH\/AFM/);
    expect(validateProcedure(c, "en")).toEqual([]);
    expect(editorIssues(p, "en")).toEqual([]);
    // a bank-only target keeps its key, an empty target object is dropped
    p.targets = {};
    expect(cleanDraft(p).targets).toBeUndefined();
    // a cleared time limit (NaN from an emptied field) is no limit
    p.items[0].withinS = Number.NaN;
    expect(cleanDraft(p).items[0].withinS).toBeUndefined();
  });

  it("customises a library procedure into a club copy that saves", async () => {
    const { cleanDraft, editorIssues } = await ed();
    const store = await import("../src/train/procedureStore");
    const draft = store.customise("c172.engineFailure.en")!;
    expect(draft.basedOn).toBe("c172.engineFailure.en");
    draft.items[0].text = `${draft.items[0].text} (club)`;
    expect(editorIssues(draft, "en")).toEqual([]);
    const r = store.saveProcedure(cleanDraft(draft), "en");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.procedure.source).toBe("club");
    expect(store.clubOverride("c172.engineFailure.en")?.id).toBe(
      r.procedure.id,
    );
    // the library one is hidden from the effective list, the club one replaces it
    const eff = store.effectiveProcedures("en").map((p) => p.id);
    expect(eff).toContain(r.procedure.id);
    expect(eff).not.toContain("c172.engineFailure.en");
  });

  it("previews memory items and the checklist as the student sees them", async () => {
    const { previewModel, gradingSummary } = await ed();
    const { libraryProcedure } = await import("../src/train/procedureLibrary");
    const { setLang } = await i18n();
    setLang("en");
    const p = libraryProcedure("c172.engineFailure.fr")!;
    const m = previewModel(p);
    const nMem = p.items.filter((i) => i.memory).length;
    expect(m.memory).toHaveLength(nMem);
    expect(m.checklist).toHaveLength(p.items.length - nMem);
    expect(m.failure).toBe("Panne moteur"); // the procedure's own language
    expect(m.disclaimer).toMatch(/^Aide à l’entraînement/);
    expect(m.targets).toMatch(/^Tenir 68 kt/);
    expect(m.checklist.every((x) => x.n > 0)).toBe(true);
    // an item with no text shows its machine check in words
    p.items[0].text = "";
    p.items[0].check = {
      id: "switch",
      p: { key: "fuelSelector", value: "BOTH" },
    };
    expect(previewModel(p).memory[0].text).toMatch(/^Sélecteur carburant/);
    const g = gradingSummary(p);
    expect(g.some((s) => /memory item/.test(s))).toBe(true);
    expect(g.some((s) => /70\/100/.test(s))).toBe(true);
  });

  it("writes an untouched item's text from its check, never over the author's own words", async () => {
    const { setItemCheck, setCheckParam, syncText } = await ed();
    const it: import("../src/train/procedureTypes").ProcItem = { id: "i1", text: "", memory: false, check: { id: "manual" } };
    let before = it.check && { ...it.check };
    setItemCheck(it, "switch");
    setCheckParam(it, "key", "mixture");
    setCheckParam(it, "value", 0);
    expect(syncText(it, before, "fr")).toBe(true);
    expect(it.text).toBe("Mélange — ÉTOUFFOIR");
    // the check changes again: the auto text follows
    before = { ...it.check!, p: { ...it.check!.p } };
    setCheckParam(it, "value", 1);
    expect(syncText(it, before, "fr")).toBe(true);
    expect(it.text).toBe("Mélange — PLEIN RICHE");
    // the author's text stays
    it.text = "Mélange — plein riche (vérifier)";
    before = { ...it.check!, p: { ...it.check!.p } };
    setCheckParam(it, "value", 0);
    expect(syncText(it, before, "fr")).toBe(false);
    expect(it.text).toBe("Mélange — plein riche (vérifier)");
    // back to a Done item: an auto text is cleared, so the author writes the callout
    it.text = "Mélange — ÉTOUFFOIR";
    before = { ...it.check!, p: { ...it.check!.p } };
    setItemCheck(it, "manual");
    expect(syncText(it, before, "fr")).toBe(true);
    expect(it.text).toBe("");
  });

  it("files a new procedure under the right category for its failure", async () => {
    const { categoryFor } = await ed();
    expect(categoryFor("engineFire")).toBe("fire");
    expect(categoryFor("electricalFire")).toBe("fire");
    expect(categoryFor("fuelLeak")).toBe("engine");
    expect(categoryFor("alternator")).toBe("electrical");
    expect(categoryFor("vacuum")).toBe("instruments");
    expect(categoryFor("comms")).toBe("comms");
    expect(categoryFor("gps")).toBe("avionics");
    expect(categoryFor("trimRunaway")).toBe("flight");
    expect(categoryFor("door")).toBe("other");
  });

  it("types the throttle in % and names the glideslope in plain French", async () => {
    const { isFraction, pctLabel, failureName } = await ed();
    const { CHECKS } = await import("../src/train/procedureChecks");
    const thr = CHECKS.throttle.params.find((x) => x.name === "value")!;
    expect(isFraction(thr)).toBe(true);
    expect(pctLabel(thr, "en")).toBe("Throttle (%)");
    expect(pctLabel(thr, "fr")).toBe("Gaz (%)");
    // other number parameters keep their own unit
    const ias = CHECKS.ias.params.find((x) => x.type === "number")!;
    expect(isFraction(ias)).toBe(false);
    expect(failureName("gs", "fr")).not.toBe("Glide");
    expect(failureName("gs", "en")).toBe("Glideslope");
    expect(failureName("vacuum", "fr")).toBe("Panne de dépression");
  });
});
