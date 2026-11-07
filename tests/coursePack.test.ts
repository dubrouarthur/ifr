// Ground school package A: validation, migration, the IndexedDB store (memory backend), .ifrcourse files with
// conflict policies, share codes, handoff tokens and attempt records.
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  courseAdvisories,
  courseHash,
  isStructurallyValid,
  missingTranslations,
  validateCourse,
  type CourseIssue,
} from "../src/course/validate";
import { migrate, migrateCourseFile } from "../src/course/migrate";
import {
  CourseStore,
  DB_NAME,
  INDEX_KEY,
  STORES,
  storageNotice,
} from "../src/course/store";
import {
  buildCourseFile,
  clubPackCourses,
  courseShareLink,
  decodeCourseShare,
  decodeSceneShare,
  encodeCourseFile,
  encodeCourseShare,
  encodeSceneShare,
  exportCourse,
  importCourseBlob,
  importCourseFiles,
  importCourseShare,
  readCourseFile,
  sceneLink,
  shareCodeFromUrl,
  unsafeSvg,
  withCourses,
  bytesToB64,
} from "../src/course/pack";
import {
  consumeHandoff,
  courseReturnUrl,
  createHandoff,
  flyUrl,
  handoffStatus,
  HandoffCreateError,
  isSafeReturnUrl,
  newToken,
  parsePlayHash,
  pruneHandoffs,
  recordAttempt,
  recordFlyResult,
  recordYourTurnResult,
  resolveHandoff,
  TOKEN_RE,
} from "../src/course/handoff";
import { IdbQuotaError, MemoryDb, sha256Hex } from "../src/lib/idb";
import type {
  AttemptRecord,
  Course,
  CourseFile,
  SimScene,
  SlideBlock,
  Step,
} from "../src/course/types";

// ------------------------------------------------------------------ fixtures
const scene: SimScene = {
  v: 1,
  id: "r276",
  label: "ARD R-276 · 6 NM",
  world: { kind: "training" },
  cockpit: "g1000",
  pose: {
    kind: "fields",
    pos: { fix: "ARD", radial: 276, distNm: 6 },
    altFt: 4000,
    hdg: 96,
    iasKt: 100,
    radios: { nav1: "ARD", obs1: 96, cdi: "NAV1" },
  },
  weather: { windDir: 250, windKt: 10 },
  seed: 4183,
};
const t = (en: string, fr?: string) => (fr === undefined ? { en } : { en, fr });
function steps(): Step[] {
  const blocks: SlideBlock[] = [
    {
      id: "title",
      kind: "text",
      style: "title",
      text: t("Intercept the 090° course", "Interception de la route 090°"),
      frame: { x: 96, y: 72, w: 1200, h: 120, z: 1 },
    },
    {
      id: "hsi",
      kind: "instrument",
      view: { kind: "gauge", gauge: "hsi" },
      controls: ["obs1", "hdgBug"],
      frame: { x: 96, y: 240, w: 720, h: 720, z: 2 },
      alt: t(
        "HSI: course 090, bar one dot right, TO",
        "HSI : route 090, barre un point à droite, TO",
      ),
      goal: [0],
    },
    {
      id: "list",
      kind: "checklist",
      rows: [
        {
          text: t("OBS 090 with a TO flag", "OBS 090 avec TO"),
          check: 0,
          readout: "obs1",
        },
      ],
      frame: { x: 960, y: 240, w: 800, h: 400, z: 3 },
    },
    {
      id: "m1",
      kind: "marker",
      n: 1,
      frame: { x: 860, y: 300, w: 48, h: 48, z: 4 },
      reveal: { order: 1, when: "afterCheck:0" },
    },
    {
      id: "arrow",
      kind: "arrow",
      from: [900, 320],
      to: [700, 500],
      frame: { x: 700, y: 320, w: 200, h: 180, z: 5 },
    },
    {
      id: "go",
      kind: "text",
      style: "body",
      text: t("Next: fly it", "Ensuite : en vol"),
      onTap: { k: "goto", step: { ref: "fly" } },
      frame: { x: 960, y: 900, w: 600, h: 80, z: 6 },
    },
    {
      id: "val",
      kind: "text",
      style: "number",
      text: t("{{value}} ft/NM"),
      bind: { k: "calc", step: "calc", field: "answer" },
      frame: { x: 960, y: 700, w: 400, h: 120, z: 7 },
    },
  ];
  return [
    {
      id: "intro",
      kind: "explain",
      title: t("The CDI", "Le CDI"),
      reader: [
        {
          t: "text",
          text: t("The bar shows the course.", "La barre montre la route."),
        },
      ],
      stage: { panes: [{ kind: "pfd" }], mode: "frozen", scene: "r276" },
    },
    {
      id: "try",
      kind: "try",
      title: t("Intercept", "Interception"),
      reader: [
        {
          t: "doThis",
          rows: [{ text: t("OBS 090", "OBS 090"), check: 0, readout: "obs1" }],
        },
      ],
      stage: {
        panes: [{ kind: "six" }],
        mode: "live",
        scene: "r276",
        controls: ["obs1", "bank"],
        assist: { holdAlt: true, holdIas: true },
      },
      goal: {
        all: [
          { id: "obs", p: { nav: 1, value: 90, tol: 2 } },
          { id: "cdiDefl", p: { maxDots: 1 } },
        ],
        holdS: 10,
        graded: false,
      },
    },
    {
      id: "slide",
      kind: "try",
      title: t("Your turn", "À vous"),
      reader: [],
      layout: "canvas",
      slide: {
        size: { w: 1920, h: 1080 },
        grid: 24,
        scene: "r276",
        layout: "instrumentNotes",
        blocks,
      },
      goal: {
        all: [{ id: "obs", p: { nav: 1, value: 90, tol: 2 } }],
        graded: false,
      },
    },
    {
      id: "calc",
      kind: "calc",
      title: t("Descent gradient", "Pente de descente"),
      reader: [],
      calc: { generatorId: "ifr.descentGradient", showSolution: "onCheck" },
    },
    {
      id: "drill",
      kind: "drill",
      title: t("Drill", "Entraînement"),
      reader: [],
      drill: {
        generatorIds: ["ifr.sixtyToOne", "ifr.descentRate"],
        count: 10,
        timer: { mode: "total", seconds: 300 },
        practiceOnly: true,
      },
    },
    {
      id: "quiz",
      kind: "quiz",
      title: t("Check", "Vérifiez"),
      reader: [],
      quiz: {
        kind: "mcq",
        prompt: t("Which flag?", "Quel indicateur ?"),
        options: [{ text: t("TO") }, { text: t("FROM") }],
        answer: 0,
        explain: t("Toward the station.", "Vers la station."),
      },
    },
    {
      id: "fly",
      kind: "fly",
      title: t("Fly it", "En vol"),
      reader: [],
      flyIt: {
        target: { kind: "scene", scene: "r276", durationS: 120 },
        options: ["wind", "surpriseMe"],
        defaultsOn: ["wind"],
        surprisePool: ["vacuum"],
        criteria: [
          {
            id: "lat",
            label: t("CDI within ¾ scale", "CDI dans ¾ d’échelle"),
            check: { id: "acsScale", p: { axis: "lat", frac: 0.75 } },
            acs: "IR.V.A",
          },
        ],
        returnTo: "thisStep",
      },
    },
  ];
}
function course(over: Partial<Course> = {}): Course {
  return {
    format: "ifr-course",
    version: 1,
    id: "vor-tracking",
    rev: 1,
    updated: "2026-11-01T10:00:00.000Z",
    title: t(
      "VOR tracking, inbound and outbound",
      "Suivi VOR, en rapprochement et en éloignement",
    ),
    author: { name: "J. Martin", club: "Aéroclub Ardon" },
    langs: ["en", "fr"],
    cockpit: "g1000",
    world: { kind: "training" },
    steps: steps(),
    scenes: { r276: scene },
    clips: {},
    assets: {},
    ...over,
  };
}
const errors = (x: unknown) =>
  validateCourse(x).filter((i) => i.level === "error");
const codes = (is: CourseIssue[]) => is.map((i) => i.code);
let clock = Date.parse("2026-11-06T09:00:00.000Z");
const now = () => new Date(clock);
async function store(over: { db?: MemoryDb } = {}) {
  const kv = new Map<string, string>();
  let asked = 0;
  const s = await CourseStore.open({
    db: over.db ?? new MemoryDb(DB_NAME, STORES),
    kv: {
      getItem: (k) => kv.get(k) ?? null,
      setItem: (k, v) => void kv.set(k, v),
      removeItem: (k) => void kv.delete(k),
    },
    channel: false,
    now,
    persist: async () => {
      asked++;
      return "granted";
    },
  });
  return { s, kv, asked: () => asked };
}
const png = (seed: number) =>
  new Blob(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, seed, seed + 1, seed + 2])],
    { type: "image/png" },
  );

// ------------------------------------------------------------------ validation
describe("validateCourse", () => {
  it("accepts a course using every kind of step and block", () => {
    expect(errors(course())).toEqual([]);
  });
  it("refuses what is not a course, and a newer format", () => {
    expect(codes(validateCourse(null))).toEqual(["shape"]);
    expect(validateCourse({ ...course(), version: 2 })[0].message.en).toMatch(
      /newer version/,
    );
    expect(
      isStructurallyValid(validateCourse({ ...course(), steps: "x" })),
    ).toBe(false);
    const dup = course();
    dup.steps[1].id = "intro";
    expect(isStructurallyValid(validateCourse(dup))).toBe(false);
  });
  it("finds broken references", () => {
    const c = course();
    c.steps[0].stage!.scene = "nope";
    (c.steps[2].slide!.blocks[5] as { onTap: unknown }).onTap = {
      k: "goto",
      step: { ref: "ghost" },
    };
    (c.steps[2].slide!.blocks[6] as { bind: unknown }).bind = {
      k: "calc",
      step: "quiz",
      field: "answer",
    };
    c.steps[6].flyIt!.target = { kind: "scene", scene: "gone" };
    c.steps[1].reader = [{ t: "image", asset: "f".repeat(64), alt: t("") }];
    const is = errors(c);
    expect(codes(is)).toEqual(
      expect.arrayContaining(["ref.scene", "ref.step", "ref.asset", "alt"]),
    );
    expect(
      is.find((i) => i.path === "steps[2].slide.blocks[6].bind.step")?.message
        .en,
    ).toMatch(/not a calc step/);
    expect(isStructurallyValid(validateCourse(c))).toBe(true); // content errors never block a draft
  });
  it("requires alt text on images, instruments and diagrams (SPEC §7)", () => {
    const c = course();
    delete c.steps[2].slide!.blocks[1].alt;
    c.steps[2].slide!.blocks.push({
      id: "d",
      kind: "diagram",
      d: { kind: "hold", inbound: 270, turn: "R", fix: "ARD" },
      frame: { x: 0, y: 0, w: 400, h: 300, z: 9 },
    });
    c.steps[2].slide!.blocks.push({
      id: "img",
      kind: "image",
      image: { lib: "photo:c172-panel" },
      alt: t(" "),
      frame: { x: 0, y: 0, w: 400, h: 300, z: 9 },
    });
    expect(
      errors(c)
        .filter((i) => i.code === "alt")
        .map((i) => i.blockId),
    ).toEqual(["hsi", "d", "img"]);
  });
  it("never grades a step or a Your turn with an assist (SPEC §4.3)", () => {
    const c = course();
    c.steps[1].goal!.graded = true;
    (c.steps[2].slide!.blocks[1] as { yourTurn?: unknown }).yourTurn = {
      where: "slide",
      prompt: t("Centre the needle"),
      assist: { holdAlt: true },
      goal: { all: [{ id: "cdiDefl", p: { maxDots: 1 } }], graded: true },
    };
    expect(
      errors(c)
        .filter((i) => i.code === "graded")
        .map((i) => i.path),
    ).toEqual([
      "steps[1].goal.graded",
      "steps[2].slide.blocks[1].yourTurn.goal.graded",
    ]);
  });
  it("checks calc, drill, quiz, goals and slide fields", () => {
    const c = course();
    c.steps[3].calc = { generatorId: "ifr.nope" as "ifr.vdp", tolerance: -1 };
    c.steps[4].drill = {
      ...c.steps[4].drill!,
      count: 0,
      practiceOnly: false as true,
    };
    (c.steps[5].quiz as { answer: number }).answer = 5;
    c.steps[1].goal!.all.push({
      id: "onRadial",
      p: { navaid: "ZZZ", radial: 90, tol: 5 },
    });
    (c.steps[1].reader[0] as { rows: { check: number }[] }).rows[0].check = 9;
    c.steps[2].slide!.size = { w: 1024, h: 768 } as never;
    (c.steps[2].slide!.blocks[0] as { onTap?: unknown }).onTap = {
      k: "url",
      href: "javascript:alert(1)",
    };
    c.steps[2].slide!.blocks[3].reveal = { order: 1, when: "afterCheck:4" };
    const is = errors(c);
    for (const p of [
      "steps[3].calc.generatorId",
      "steps[3].calc.tolerance",
      "steps[4].drill.count",
      "steps[4].drill.practiceOnly",
      "steps[5].quiz.answer",
      "steps[1].goal.all[2]",
      "steps[1].reader[0].rows[0].check",
      "steps[2].slide.size",
      "steps[2].slide.blocks[0].onTap.href",
      "steps[2].slide.blocks[3].reveal.when",
    ])
      expect(
        is.map((i) => i.path),
        p,
      ).toContain(p);
  });
  it("advises without blocking: pacing, missing French, wording, Fly it with no return", () => {
    const explain = (i: number): Step => ({
      id: `e${i}`,
      kind: "explain",
      title: t(`Explain ${i}`),
      reader: [{ t: "text", text: t("Read this, it is approved.") }],
    });
    const c = course({
      steps: [
        explain(1),
        explain(2),
        explain(3),
        explain(4),
        ...steps().slice(1),
      ],
    });
    (c.steps[c.steps.length - 1].flyIt as { returnTo?: string }).returnTo =
      undefined;
    const adv = courseAdvisories(c);
    expect(codes(adv)).toEqual(
      expect.arrayContaining(["pacing", "fr", "wording", "flyReturn"]),
    );
    expect(adv.find((i) => i.code === "pacing")!.message.en).toMatch(
      /^4 steps in a row/,
    );
    expect(adv.every((i) => i.level === "warn")).toBe(true);
    expect(missingTranslations(c).count).toBe(11);
    expect(missingTranslations({ ...c, langs: ["en"] }).count).toBe(0);
  });
});

describe("content hash", () => {
  it("is stable across key order and ignores rev / updated / hash", async () => {
    expect(canonicalJson({ b: 1, a: [1, { d: undefined, c: 2 }] })).toBe(
      '{"a":[1,{"c":2}],"b":1}',
    );
    const a = course();
    const h = await courseHash(a);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(
      await courseHash({
        ...a,
        rev: 9,
        updated: "2027-01-01T00:00:00.000Z",
        hash: "x",
      }),
    ).toBe(h);
    const b = course();
    b.steps[0].title.en = "The HSI";
    expect(await courseHash(b)).not.toBe(h);
  });
});

describe("migrate", () => {
  it("lifts a pre-release draft to version 1", () => {
    const m = migrate({
      id: "draft",
      title: "Holding",
      steps: [
        {
          id: "s1",
          kind: "explain",
          title: "Entries",
          reader: [{ t: "keys", items: ["Turn, time, twist"] }],
        },
      ],
      scenes: { a: { ...scene, id: "a", label: "plain text stays" } },
    });
    expect(m.from).toBe(0);
    const c = m.value!;
    expect(c.version).toBe(1);
    expect(c.title).toEqual({ en: "Holding" });
    expect(c.steps[0].title).toEqual({ en: "Entries" });
    expect(c.steps[0].reader[0]).toEqual({
      t: "keys",
      items: [{ en: "Turn, time, twist" }],
    });
    expect(c.scenes.a.label).toBe("plain text stays");
    expect(c.langs).toEqual(["en"]);
    expect(isStructurallyValid(validateCourse(c))).toBe(true);
  });
  it("keeps the invariants and refuses newer versions", () => {
    const c = course();
    delete (c.steps[2] as { layout?: string }).layout;
    (c.steps[4].drill as { practiceOnly: unknown }).practiceOnly = false;
    const m = migrate(c);
    expect(m.value!.steps[2].layout).toBe("canvas");
    expect(m.value!.steps[4].drill!.practiceOnly).toBe(true);
    expect(migrate({ ...course(), version: 3 }).value).toBeNull();
    expect(migrate("{").issues[0].en).toMatch(/invalid JSON/);
    expect(
      migrateCourseFile({ format: "ifr-course-file", version: 9 }).value,
    ).toBeNull();
    expect(migrateCourseFile(course()).value!.format).toBe("ifr-course-file");
  });
});

// ------------------------------------------------------------------ store
describe("CourseStore (memory backend)", () => {
  it("saves with rev + 1, a hash, the synchronous index and persist() once", async () => {
    const { s, kv, asked } = await store();
    expect(s.backend).toBe("memory");
    expect(storageNotice(s)).toMatch(/Not saved on this device/);
    const r = await s.save(course());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.course.rev).toBe(2);
    expect(r.course.updated).toBe(now().toISOString());
    expect(r.course.hash).toBe(await courseHash(r.course));
    await s.save(r.course);
    expect(asked()).toBe(1);
    expect(s.persistState()).toBe("granted");
    const idx = s.list();
    expect(idx).toHaveLength(1);
    expect(idx[0]).toMatchObject({
      id: "vor-tracking",
      rev: 3,
      steps: 7,
      langs: ["en", "fr"],
    });
    expect(kv.get(INDEX_KEY)!.length).toBeLessThan(2048);
    expect((await s.get("vor-tracking"))!.rev).toBe(3);
  });
  it("refuses structurally invalid courses and reports a full disk in the app", async () => {
    const { s } = await store();
    const bad = await s.save({ ...course(), id: "" });
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const db = new MemoryDb(DB_NAME, STORES);
    db.put = async () => {
      throw new IdbQuotaError();
    };
    const full = await (await store({ db })).s.save(course());
    expect(full.ok).toBe(false);
    if (!full.ok) {
      expect(full.error).toBe("quota");
      expect(full.message.fr).toMatch(/stockage de cet appareil est plein/);
    }
  });
  it("duplicates, deletes, assigns, and nudges an export after 7 days", async () => {
    const { s } = await store();
    await s.save(course());
    const d = await s.duplicate("vor-tracking");
    expect(d.ok && d.course.id).toMatch(/^vor-tracking-[a-z0-9]{6}$/);
    const dupId = d.ok ? d.course.id : "";
    expect(d.ok && d.course.rev).toBe(1);
    s.setAssigned("vor-tracking", true);
    expect(s.indexEntry("vor-tracking")!.assigned).toBe(true);
    expect(s.needsExport("vor-tracking")).toBe(false);
    clock += 8 * 86_400_000;
    expect(s.needsExport("vor-tracking")).toBe(true);
    s.markExported("vor-tracking");
    expect(s.needsExport("vor-tracking")).toBe(false);
    s.setLast("vor-tracking", "try");
    await s.setProgress({
      courseId: "vor-tracking",
      profileId: "tom",
      rev: 1,
      stepId: "try",
      reveal: 1,
    });
    expect(s.last()).toEqual({ id: "vor-tracking", stepId: "try" });
    await s.delete("vor-tracking");
    expect(await s.get("vor-tracking")).toBeNull();
    expect(await s.getProgress("vor-tracking", "tom")).toBeNull();
    expect(s.list().map((c) => c.id)).toEqual([dupId]);
    expect(s.last()).toBeNull();
    expect((await s.reindex()).map((c) => c.id)).toEqual([dupId]);
  });
  it("stores images once by sha-256 and collects the unused ones", async () => {
    const { s } = await store();
    const a = await s.putAsset(png(1), { w: 10, h: 10, role: "image" });
    const b = await s.putAsset(png(1), { w: 10, h: 10, role: "image" });
    const c = await s.putAsset(png(7), { w: 10, h: 10, role: "image" });
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(await sha256Hex(png(1)));
    expect(a).toMatchObject({ mime: "image/png", bytes: 7 });
    await s.save(course({ assets: { [a.id]: a } }));
    await s.addTray({ scene, thumb: c.id, label: "ARD R-276" });
    const orphan = await s.putAsset(png(20), { w: 1, h: 1, role: "image" });
    expect(await s.gcAssets()).toBe(1);
    expect(await s.hasAsset(orphan.id)).toBe(false);
    expect(await s.hasAsset(a.id)).toBe(true);
    expect(await s.hasAsset(c.id)).toBe(true);
  });
  it("keeps the tray, progress and attempts per profile", async () => {
    const { s } = await store();
    const seen: string[] = [];
    s.onChange((c) => seen.push(c.store));
    await s.addTray({ scene, at: "2026-11-06T09:00:00.000Z" });
    await s.addTray({
      scene,
      at: "2026-11-06T09:05:00.000Z",
      courseId: "other",
    });
    expect((await s.listTray()).map((x) => x.at)).toEqual([
      "2026-11-06T09:05:00.000Z",
      "2026-11-06T09:00:00.000Z",
    ]);
    expect(await s.listTray("vor-tracking")).toHaveLength(1);
    const att = (o: Partial<AttemptRecord>): AttemptRecord => ({
      courseId: "vor-tracking",
      rev: 1,
      stepId: "quiz",
      profileId: "tom",
      at: now().toISOString(),
      secs: 12,
      kind: "answer",
      answer: 0,
      correct: true,
      ...o,
    });
    await s.addAttempt(att({}));
    await s.addAttempt(att({ profileId: "ana" }));
    await s.addAttempt(att({ stepId: "calc", kind: "calc" }));
    expect(await s.listAttempts({ profileId: "tom" })).toHaveLength(2);
    expect(await s.listAttempts({ kind: "calc" })).toHaveLength(1);
    expect(seen).toContain("tray");
    expect(seen).toContain("attempts");
  });
  it("opens on memory when IndexedDB is missing", async () => {
    const s = await CourseStore.open({
      factory: null,
      channel: false,
      kv: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    });
    expect(s.backend).toBe("memory");
    expect(s.reason).toMatch(/not available/);
    expect(storageNotice(s, "fr")).toMatch(/Non enregistré sur cet appareil/);
  });
});

// ------------------------------------------------------------------ files and conflict policies
describe(".ifrcourse files", () => {
  it("round-trips through gzip with the images", async () => {
    const { s } = await store();
    const ref = await s.putAsset(png(3), {
      w: 10,
      h: 10,
      role: "image",
      source: "CFI photo",
    });
    await s.save(course({ assets: { [ref.id]: ref } }));
    const ex = (await exportCourse(s, "vor-tracking"))!;
    expect(ex.filename).toBe("vor-tracking-inbound-and-outbound.ifrcourse");
    expect(ex.missing).toEqual([]);
    const head = new Uint8Array(await ex.blob.slice(0, 2).arrayBuffer());
    expect([head[0], head[1]]).toEqual([0x1f, 0x8b]);
    expect(s.indexEntry("vor-tracking")!.exported).toBe(now().toISOString());
    const r = await readCourseFile(ex.blob);
    expect(r.file!.course.id).toBe("vor-tracking");
    expect(Object.keys(r.file!.assets)).toEqual([ref.id]);
    // into another device
    const other = (await store()).s;
    const rep = await importCourseBlob(other, ex.blob);
    expect(rep.added).toEqual(["vor-tracking"]);
    expect(rep.assets).toBe(1);
    expect(await other.hasAsset(ref.id)).toBe(true);
    expect((await other.get("vor-tracking"))!.rev).toBe(
      (await s.get("vor-tracking"))!.rev,
    );
    // plain JSON and a bare course are accepted too
    expect((await readCourseFile(JSON.stringify(r.file))).file).not.toBeNull();
    expect(
      (await readCourseFile(JSON.stringify(course()))).file!.course.id,
    ).toBe("vor-tracking");
    expect((await readCourseFile(new Uint8Array([1, 2, 3]))).file).toBeNull();
  });
  it("applies the conflict policies newer / replace / keep / copy", async () => {
    const { s } = await store();
    await s.save(course({ updated: "2026-11-01T10:00:00.000Z" }), {
      keepRev: true,
    });
    const file = (c: Course): CourseFile => ({
      format: "ifr-course-file",
      version: 1,
      course: c,
      assets: {},
    });
    const same = await importCourseFiles(s, [
      file(course({ updated: "2026-11-01T10:00:00.000Z" })),
    ]);
    expect(same.skipped[0].reason).toBe("already up to date");
    const older = course({ updated: "2026-10-01T10:00:00.000Z" });
    older.steps[0].title = t("Old");
    expect((await importCourseFiles(s, [file(older)])).skipped[0].reason).toBe(
      "local version is newer",
    );
    expect(
      (await importCourseFiles(s, [file(older)], "keep")).skipped[0].reason,
    ).toBe("local version kept");
    expect(
      (await importCourseFiles(s, [file(older)], "replace")).replaced,
    ).toEqual(["vor-tracking"]);
    expect((await s.get("vor-tracking"))!.steps[0].title.en).toBe("Old");
    const newer = course({ updated: "2026-11-05T10:00:00.000Z" });
    expect((await importCourseFiles(s, [file(newer)])).replaced).toEqual([
      "vor-tracking",
    ]);
    const changed = course({ updated: "2026-11-05T11:00:00.000Z" });
    changed.steps[0].title = t("Copy me");
    const cp = await importCourseFiles(s, [file(changed)], "copy");
    expect(cp.renamed).toEqual([
      { from: "vor-tracking", to: "vor-tracking-2" },
    ]);
    expect((await s.get("vor-tracking-2"))!.steps[0].title.en).toBe("Copy me");
    const broken = await importCourseFiles(s, [file({ ...course(), id: "" })]);
    expect(broken.skipped[0].reason).toMatch(/id is missing/);
  });
  it("never replaces another author's course that shares an id, nor shadows a sample", async () => {
    const { s } = await store();
    await s.save(course({ updated: "2026-11-01T10:00:00.000Z" }), { keepRev: true });
    const file = (c: Course): CourseFile => ({ format: "ifr-course-file", version: 1, course: c, assets: {} });
    const bob = course({ updated: "2026-11-05T10:00:00.000Z", author: { name: "B. Durand", club: "Aéroclub du Sud" } });
    bob.steps[0].title = t("Bob's step");
    const r = await importCourseFiles(s, [file(bob)]);
    expect(r.replaced).toEqual([]);
    expect(r.renamed.length).toBe(1);
    expect(r.renamed[0].to).toMatch(/^vor-tracking-[a-z0-9]{6}$/);
    expect((await s.get("vor-tracking"))!.steps[0].title.en).not.toBe("Bob's step");
    expect((await s.get(r.renamed[0].to))!.steps[0].title.en).toBe("Bob's step");
    // a file carrying a built-in sample's id comes in under a new id
    const r2 = await importCourseFiles(s, [file(course({ id: "sample-vor" }))]);
    expect(r2.renamed[0].from).toBe("sample-vor");
    expect(await s.get("sample-vor")).toBeNull();
    // new ids are unique and never a sample's
    const a = await s.newId("my-course");
    const b = await s.newId("sample-vor");
    expect(a).not.toBe(await s.newId("my-course"));
    expect(b.startsWith("sample-")).toBe(false);
    expect(await s.freeId("sample-vor")).toBe("sample-vor-2");
  });
  it("checks imported images: sha-256 re-keyed, unsafe SVG and unknown types refused", async () => {
    const { s } = await store();
    const bytes = new Uint8Array(await png(9).arrayBuffer());
    const wrongId = "0".repeat(64);
    const svgId = "1".repeat(64);
    const gifId = "2".repeat(64);
    const c = course({
      assets: {
        [wrongId]: {
          id: wrongId,
          mime: "image/png",
          w: 10,
          h: 10,
          bytes: 7,
          role: "image",
        },
        [svgId]: {
          id: svgId,
          mime: "image/svg+xml",
          w: 10,
          h: 10,
          bytes: 40,
          role: "diagram",
        },
        [gifId]: {
          id: gifId,
          mime: "image/png",
          w: 10,
          h: 10,
          bytes: 3,
          role: "image",
        },
      },
    });
    c.steps[0].reader.push({ t: "image", asset: wrongId, alt: t("Panel") });
    const evil =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>';
    expect(unsafeSvg(evil)).toBe(true);
    expect(
      unsafeSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>',
      ),
    ).toBe(false);
    const rep = await importCourseFiles(s, [
      {
        format: "ifr-course-file",
        version: 1,
        course: c,
        assets: {
          [wrongId]: { mime: "image/png", b64: bytesToB64(bytes) },
          [svgId]: { mime: "image/svg+xml", b64: btoa(evil) },
          [gifId]: { mime: "image/gif", b64: "R0lG" },
        },
      },
    ]);
    expect(rep.added).toEqual(["vor-tracking"]);
    expect(rep.issues.join(" ")).toMatch(/SVG contains scripts/);
    expect(rep.issues.join(" ")).toMatch(/unsupported type image\/gif/);
    const realId = await sha256Hex(bytes);
    const stored = (await s.get("vor-tracking"))!;
    expect(stored.assets[realId]).toMatchObject({ id: realId, bytes: 7 });
    expect(stored.assets[wrongId]).toBeUndefined();
    expect(stored.steps[0].reader[1]).toEqual({
      t: "image",
      asset: realId,
      alt: t("Panel"),
    });
    expect(await s.hasAsset(svgId)).toBe(false);
  });
  it("adapts the club pack (courses[] next to the procedures)", async () => {
    const f = (await buildCourseFile(course(), async () => null)).file;
    const pack = withCourses(
      {
        format: "ifr-club-pack",
        version: 1,
        club: "Aéroclub Ardon",
        procedures: [],
      },
      [f],
    );
    expect(pack.procedures).toEqual([]);
    expect(clubPackCourses(pack).map((x) => x.course.id)).toEqual([
      "vor-tracking",
    ]);
    expect(withCourses(pack, [f]).courses).toHaveLength(1);
    expect(clubPackCourses({ format: "something" })).toEqual([]);
    const { s } = await store();
    const rep = await importCourseBlob(
      s,
      new Blob([JSON.stringify(pack)], { type: "application/json" }),
    );
    expect(rep.added).toEqual(["vor-tracking"]);
    const gz = await encodeCourseFile(f);
    expect((await readCourseFile(gz)).file!.course.id).toBe("vor-tracking");
  });
});

describe("share codes", () => {
  it("C1: a text-only course in a link (deflate-raw, ≤ 8 KB)", async () => {
    const sh = await encodeCourseShare(course());
    expect(sh.code).toMatch(/^C1\.[A-Za-z0-9_-]+$/);
    expect(sh.fits).toBe(true);
    const link = courseShareLink(sh.code);
    expect(shareCodeFromUrl(`https://ifr.example/${link}`)).toEqual({
      kind: "course",
      code: sh.code,
    });
    const back = (await decodeCourseShare(`https://ifr.example/${link}`))!;
    expect(await courseHash(back)).toBe(await courseHash(course()));
    expect(await decodeCourseShare("C1.AAAA")).toBeNull();
    expect(await decodeCourseShare("nonsense")).toBeNull();
    const withImg = await encodeCourseShare(
      course({
        assets: {
          ["a".repeat(64)]: {
            id: "a".repeat(64),
            mime: "image/webp",
            w: 1,
            h: 1,
            bytes: 1,
            role: "image",
          },
        },
      }),
    );
    expect(withImg).toMatchObject({ fits: false, reason: "images" });
    const { s } = await store();
    expect((await importCourseShare(s, link)).added).toEqual(["vor-tracking"]);
    expect((await importCourseShare(s, "academy.html#c=C1.zz")).issues).toEqual(
      ["Invalid course link"],
    );
  });
  it("S1: one scene, short enough for a QR code", async () => {
    const sh = await encodeSceneShare({
      ...scene,
      captured: {
        at: "2026-11-06T09:00:00.000Z",
        from: "cockpit",
        thumb: "t".repeat(64),
      },
    });
    expect(sh.code).toMatch(/^S1\./);
    expect(sh.qr).toBe(true);
    const url = sceneLink(sh.code);
    expect(url).toBe(`index.html?scene=${sh.code}`);
    const back = (await decodeSceneShare(url))!;
    expect(back.pose).toEqual(scene.pose);
    expect(back.captured?.thumb).toBeUndefined();
    expect(await decodeSceneShare("S1.e30")).toBeNull();
  });
});

// ------------------------------------------------------------------ handoffs and attempts
describe("Fly-it handoff (SPEC §6.2)", () => {
  it("creates a token record with the return URL, and resolves and consumes it", async () => {
    const { s } = await store();
    const c = course();
    await s.save(c, { keepRev: true });
    const fly = c.steps[6];
    const h = await createHandoff(
      s,
      { course: c, step: fly, options: ["surpriseMe", "allowAp"] },
      now(),
    );
    expect(h.token).toMatch(TOKEN_RE);
    expect(newToken()).not.toBe(newToken());
    expect(h.options).toEqual(["surpriseMe"]); // only what the step offers
    expect(h.criteria[0].acs).toBe("IR.V.A");
    expect(h.returnUrl).toBe(
      `academy.html#play=vor-tracking&s=fly&a=${h.token}`,
    );
    expect(flyUrl(h.token)).toBe(`index.html?fly=${h.token}`);
    expect(
      (await createHandoff(s, { course: c, step: fly }, now())).options,
    ).toEqual(["wind"]); // defaultsOn
    let r = await resolveHandoff(s, h.token, now());
    expect(r.state).toBe("pending");
    expect(r.step!.id).toBe("fly");
    expect(r.courseChanged).toBe(false);
    expect(await handoffStatus(s, h.token, "tom")).toMatchObject({
      status: "pending",
    });
    await consumeHandoff(s, h.token, now());
    r = await resolveHandoff(s, h.token, now());
    expect(r.state).toBe("consumed");
    expect(await handoffStatus(s, h.token, "tom")).toMatchObject({
      status: "notFinished",
    });
    expect((await resolveHandoff(s, "bad token!")).state).toBe("missing");
    expect(
      (await resolveHandoff(s, h.token, new Date(clock + 30 * 86_400_000)))
        .state,
    ).toBe("expired");
  });
  it("records one attempt per token; two tabs never overwrite each other", async () => {
    const { s } = await store();
    const c = course();
    await s.save(c, { keepRev: true });
    const a = await createHandoff(s, { course: c, step: c.steps[6] }, now());
    const b = await createHandoff(s, { course: c, step: c.steps[6] }, now());
    const res = {
      profileId: "tom",
      passed: false,
      selfGrade: "close" as const,
      criteria: [
        { id: "lat", met: false, worst: "1.8 dots", atS: 74 },
        { id: "stray", met: true },
      ],
      secs: 140,
      historyId: "h1",
    };
    const ra = (await recordFlyResult(s, a.token, res, now()))!;
    expect(ra.kind).toBe("fly");
    expect(ra.fly!.criteria.map((x) => x.id)).toEqual(["lat"]);
    await recordFlyResult(s, b.token, { ...res, passed: true }, now());
    await recordFlyResult(
      s,
      a.token,
      { ...res, selfGrade: "notyet" },
      new Date(clock + 60_000),
    );
    const all = await s.listAttempts({ kind: "fly" });
    expect(all).toHaveLength(2);
    expect(all.find((x) => x.fly!.token === a.token)!.fly!.selfGrade).toBe(
      "notyet",
    );
    expect(await handoffStatus(s, a.token, "tom")).toMatchObject({
      status: "flown",
    });
    expect(await recordFlyResult(s, "nope-nope-nope-nope", res)).toBeNull();
  });
  it("needs the solved numbers for a calc target, and keeps the return on this site", async () => {
    const { s } = await store();
    const c = course();
    const st: Step = {
      id: "tod",
      kind: "fly",
      title: t("Fly your descent"),
      reader: [],
      flyIt: {
        target: { kind: "calc", step: "calc" },
        options: [],
        criteria: [],
        returnTo: "thisStep",
      },
    };
    await expect(
      createHandoff(s, { course: c, step: st }),
    ).rejects.toBeInstanceOf(HandoffCreateError);
    const h = await createHandoff(s, {
      course: c,
      step: st,
      calc: { generatorId: "ifr.descentGradient", seed: 42, params: {} },
    });
    expect(h.calc).toEqual({
      generatorId: "ifr.descentGradient",
      seed: 42,
      params: {},
    });
    // descentGradient has no live stage: nothing to check, no criteria
    expect(h.criteria).toEqual([]);
    // the author wrote no criteria: the handoff carries the problem's stage goals (the cockpit card and the
    // course debrief list the same goals)
    const tod = await createHandoff(s, {
      course: c,
      step: st,
      calc: { generatorId: "ifr.topOfDescent", seed: 7, params: {} },
    });
    expect(tod.criteria.length).toBeGreaterThan(0);
    expect(tod.criteria[0].check.id).toBe("vsBand");
    expect(tod.criteria[0].label.en).toMatch(/VS/);
    await expect(
      createHandoff(s, {
        course: c,
        step: c.steps[6],
        returnUrl: "https://evil.example/",
      }),
    ).rejects.toMatchObject({ code: "unsafeReturn" });
    for (const ok of [
      "academy.html#play=a&s=b",
      "./academy.html",
      "/ifr/academy.html#x",
    ])
      expect(isSafeReturnUrl(ok), ok).toBe(true);
    for (const bad of [
      "javascript:alert(1)",
      "//evil.example/x",
      "https://evil.example/",
      "data:text/html,x",
      " academy.html",
      // backslashes and stripped control characters: browsers resolve these to another host
      "/\\evil.example/phish",
      "/\\/evil.example",
      "\t//evil.example",
      "/\t/evil.example",
      "\\\\evil.example",
      "academy.html\\..\\x",
    ])
      expect(isSafeReturnUrl(bad), bad).toBe(false);
    // with the page's origin: the same cases, resolved the way the browser does
    for (const bad of ["/\\evil.example/phish", "/\\/evil.example", "\t//evil.example", "https://evil.example/"])
      expect(isSafeReturnUrl(bad, "https://ifr.example"), bad).toBe(false);
    for (const ok of ["academy.html#play=a", "/ifr/academy.html", "https://ifr.example/academy.html"])
      expect(isSafeReturnUrl(ok, "https://ifr.example"), ok).toBe(true);
    expect(isSafeReturnUrl("http://ifr.example/academy.html", "https://ifr.example")).toBe(false);
    expect(
      isSafeReturnUrl(
        "https://ifr.example/academy.html",
        "https://ifr.example",
      ),
    ).toBe(true);
  });
  it("a sim Your turn comes back to its block", async () => {
    const { s } = await store();
    const c = course();
    const yt = {
      where: "sim" as const,
      prompt: t("Hold 4000 ft"),
      goal: {
        all: [{ id: "altBand" as const, p: { min: 3900, max: 4100 } }],
        graded: false,
      },
    };
    const h = await createHandoff(s, {
      course: c,
      step: c.steps[2],
      yourTurn: { block: "hsi", yourTurn: yt, sceneId: "r276" },
    });
    expect(h.returnUrl).toBe(
      courseReturnUrl("vor-tracking", "slide", h.token, { block: "hsi" }),
    );
    expect(parsePlayHash(h.returnUrl.slice(h.returnUrl.indexOf("#")))).toEqual({
      play: "vor-tracking",
      s: "slide",
      a: h.token,
      b: "hsi",
    });
    expect(h.target).toEqual({
      kind: "scene",
      scene: "r276",
      durationS: undefined,
      endWhen: undefined,
    });
    const a = await recordYourTurnResult(s, {
      course: c,
      stepId: "slide",
      block: "hsi",
      profileId: "tom",
      result: { met: true, checks: [true], secs: 41, token: h.token },
    });
    expect(a).toMatchObject({
      kind: "yourTurn",
      goalMet: true,
      yourTurn: { block: "hsi" },
    });
    expect(await s.listAttempts({ kind: "yourTurn" })).toHaveLength(1);
  });
  it("calc and drill attempts stay practice; old tokens are pruned", async () => {
    const { s } = await store();
    await recordAttempt(s, {
      courseId: "vor-tracking",
      rev: 1,
      stepId: "drill",
      profileId: "tom",
      at: now().toISOString(),
      secs: 280,
      kind: "drill",
      practiceGraded: true,
      drill: { count: 10, correct: 10, totalS: 280, items: [] },
    });
    const [d] = await s.listAttempts({ kind: "drill" });
    expect(d.practiceGraded).toBeUndefined();
    expect(d.correct).toBe(true);
    const c = course();
    await createHandoff(
      s,
      { course: c, step: c.steps[6] },
      new Date(clock - 20 * 86_400_000),
    );
    await createHandoff(s, { course: c, step: c.steps[6] }, now());
    expect(await pruneHandoffs(s, 14, now())).toBe(1);
    expect(await s.listHandoffs()).toHaveLength(1);
  });
});
