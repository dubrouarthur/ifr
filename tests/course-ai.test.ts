// « Assistant IA »: the plan schema, the mapper (every slide kind becomes a valid, readable slide), the key's
// storage, the error mapping and a whole generation through the real SDK with a mocked fetch (no network).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { installFakeSvgDom } from "./fakeSvgDom";
import type { Course, Lang, SlideBlock } from "../src/course/types";
import { validateCourse } from "../src/course/validate";
import {
  READ_FAILS,
  readIssueText,
  slideReadability,
} from "../src/course/canvas/readability";
import { resolveTheme } from "../src/course/canvas/themes";
import { hasCalcDiagram } from "../src/course/stage/calcKinds";
import { isStudentAction } from "../src/course/samples/kit";
import { MOTION_PRESETS, motionMarks } from "../src/course/canvas/motion";
import { GOAL_SENTENCES, READY_SITUATIONS } from "../src/course/situations";
import { addStarterDeck } from "../src/course/ui/deckStarters";
import {
  ANIMATION_IDS,
  CALC_IDS,
  CONTROL_IDS,
  SITUATION_IDS,
  SLIDE_GOAL_IDS,
  catalogText,
} from "../src/course/ai/catalog";
import {
  DeckPlanZ,
  SCHEMA_CALC_IDS,
  SLIDE_KINDS,
  parsePlan,
  partialTitles,
  type DeckPlan,
} from "../src/course/ai/schema";
import {
  cap,
  editPlan,
  fitTexts,
  goalChecks,
  mapPlan,
  outlineOf,
  situationOf,
} from "../src/course/ai/mapper";
import { courseFromPlan, addPlanToCourse } from "../src/course/ai/build";
import { systemPrompt, userMessage } from "../src/course/ai/prompt";
import { KeyStore, keyLooksValid, KEY_STORAGE } from "../src/course/ai/key";
import {
  AI_MODEL,
  errorMessage,
  generatePlan,
  requestParams,
  verifyKey,
  type ClientFactory,
} from "../src/course/ai/client";

const LANGS: Lang[] = ["fr", "en"];
const FIXTURE = JSON.parse(
  readFileSync(
    new URL("./fixtures/ai-plan-stall.json", import.meta.url),
    "utf8",
  ),
) as DeckPlan;
const plan = (): DeckPlan => JSON.parse(JSON.stringify(FIXTURE)) as DeckPlan;

function readFails(c: Course, lang: Lang): string[] {
  const theme = resolveTheme(c.theme, c.brand);
  return c.steps.flatMap((s) =>
    s.slide
      ? slideReadability(s.slide, { theme, lang })
          .filter((i) => READ_FAILS.has(i.kind))
          .map(
            (i) =>
              `${s.id}/${i.blockId}${i.otherId ? `×${i.otherId}` : ""}: ${readIssueText(i, "en").en}`,
          )
      : [],
  );
}
const errors = (c: Course) =>
  validateCourse(c)
    .filter((i) => i.level === "error")
    .map((e) => `${e.path}: ${e.message.en}`);

beforeAll(() => installFakeSvgDom());

// ------------------------------------------------------------------ schema
describe("the deck plan schema", () => {
  it("the fixture plan is valid, and covers every slide kind", () => {
    const r = parsePlan(JSON.stringify(FIXTURE));
    expect(r.ok).toBe(true);
    expect(new Set(FIXTURE.slides.map((s) => s.kind))).toEqual(
      new Set(SLIDE_KINDS),
    );
  });
  it("its enums come from the code", () => {
    expect(ANIMATION_IDS).toEqual(MOTION_PRESETS.map((p) => p.id));
    expect(SITUATION_IDS).toEqual(READY_SITUATIONS.map((s) => s.id));
    expect(
      SLIDE_GOAL_IDS.every((g) => GOAL_SENTENCES.some((x) => x.id === g)),
    ).toBe(true);
    expect([...SCHEMA_CALC_IDS].sort()).toEqual([...CALC_IDS].sort());
    for (const k of CALC_IDS) expect(hasCalcDiagram(k), k).toBe(true);
    expect(CONTROL_IDS).toContain("bank");
    expect(CONTROL_IDS).not.toContain("dragAircraft");
  });
  it("rejects what is not a plan: unknown ids, a missing language, broken JSON", () => {
    const bad = plan();
    (
      bad.slides[0] as { instrument: { animation: string } }
    ).instrument.animation = "barrel-roll";
    expect(parsePlan(bad).ok).toBe(false);
    const noFr = plan() as unknown as { title: { fr?: string } };
    delete noFr.title.fr;
    expect(parsePlan(noFr).ok).toBe(false);
    const r = parsePlan('{"title":');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]).toMatch(/JSON/);
  });
  it("fits the structured-output grammar limits: no optional field, at most three unions", () => {
    const s = JSON.stringify(betaZodOutputFormat(DeckPlanZ).schema);
    expect((s.match(/"anyOf"/g) ?? []).length).toBeLessThanOrEqual(3);
    expect(s).not.toContain('"oneOf"');
    const obj = (x: unknown): void => {
      if (!x || typeof x !== "object") return;
      const o = x as Record<string, unknown>;
      if (o.type === "object" && o.properties) {
        expect(o.additionalProperties).toBe(false);
        expect([...(o.required as string[])].sort()).toEqual(
          Object.keys(o.properties as object).sort(),
        );
      }
      Object.values(o).forEach(obj);
    };
    obj(JSON.parse(s));
  });
  it("reads the slide titles from a partial stream", () => {
    const text = JSON.stringify(FIXTURE);
    const cut = text.slice(0, text.indexOf('"kind":"quiz"') + 80);
    const t = partialTitles(cut);
    expect(t.slice(0, 4)).toEqual([
      "The stall",
      "Name the stall speed: 48 KIAS clean",
      "Your turn: hold 65 kt",
      "Approaching the stall",
    ]);
    expect(t.length).toBeLessThanOrEqual(5);
  });
  it("the system prompt is stable and lists the catalogue; the request comes last", () => {
    expect(systemPrompt()).toBe(systemPrompt());
    expect(systemPrompt()).toContain(catalogText());
    for (const id of ANIMATION_IDS) expect(systemPrompt()).toContain(id);
    const u = userMessage({
      prompt: "Les entrées en attente",
      formation: "ir",
      slides: 40,
      lang: "fr",
    });
    expect(u).toContain("Number of slides: 15");
    expect(u.trim().endsWith("Les entrées en attente")).toBe(true);
  });
});

// ------------------------------------------------------------------ mapper
describe("the mapper: a plan becomes real slides", () => {
  const made = () =>
    courseFromPlan(plan(), {
      id: "ai-c1",
      lang: "fr",
      formation: "lapl-ppl",
      run: "t1",
    });
  it("every slide kind maps to a slide, and the course validates", () => {
    const { course } = made();
    expect(course.steps.length).toBe(FIXTURE.slides.length);
    expect(course.steps.every((s) => !!s.slide)).toBe(true);
    expect(errors(course)).toEqual([]);
    expect(course.title.fr).toBe("Le décrochage");
    expect(course.tags).toContain("ai");
  });
  for (const lang of LANGS)
    it(`passes the readability guard (${lang})`, () => {
      expect(readFails(made().course, lang)).toEqual([]);
    });
  it("uses the real renderers: live instruments with animations, a goal, a quiz, a sim flight, a calc diagram", () => {
    const { course } = made();
    const blocks = course.steps.flatMap((s) => s.slide!.blocks);
    const insts = blocks.filter(
      (b): b is Extract<SlideBlock, { kind: "instrument" }> =>
        b.kind === "instrument",
    );
    expect(insts.some((b) => b.motion?.preset === "stall")).toBe(true);
    const yt = insts.find((b) => b.yourTurn)!;
    expect(yt.mode).toBe("live");
    expect(yt.controls).toEqual(["pitch", "power"]);
    expect(yt.yourTurn!.goal.all).toEqual([
      { id: "ias", p: { min: 60, max: 70 } },
    ]);
    expect(yt.yourTurn!.goal.holdS).toBe(15);
    expect(blocks.some((b) => b.kind === "quiz")).toBe(true);
    expect(
      blocks.some(
        (b) => b.kind === "simViewport" && b.yourTurn?.where === "sim",
      ),
    ).toBe(true);
    const d = blocks.find((b) => b.kind === "diagram");
    expect(
      d && d.kind === "diagram" && d.d?.kind === "calc" && d.d.calc.kind,
    ).toBe("turn");
    // every situation a slide shows is in the course; every dot names a moment of its animation
    for (const b of [
      ...insts,
      ...blocks.filter((x) => x.kind === "simViewport"),
    ])
      if ("scene" in b && b.scene)
        expect(course.scenes[b.scene], b.scene).toBeTruthy();
    for (const b of insts)
      for (const a of b.annotations ?? [])
        if (a.moment)
          expect(motionMarks(b.motion).map((m) => m.id)).toContain(a.moment);
    // the student acts at least every three slides
    const acts = course.steps.map(isStudentAction);
    for (let i = 0; i + 2 < acts.length; i++)
      expect(
        acts.slice(i, i + 3).some(Boolean),
        `slides ${i + 1}-${i + 3}`,
      ).toBe(true);
  });
  it("block and scene ids are unique, and two generations never clash", () => {
    const a = mapPlan(plan(), { run: "aa" });
    const b = mapPlan(plan(), { run: "bb" });
    const ids = a.slides.flatMap((s) => s.slide.blocks.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of Object.keys(a.scenes)) expect(b.scenes[k]).toBeUndefined();
    // identical situations share one scene
    expect(Object.keys(a.scenes).length).toBeLessThan(FIXTURE.slides.length);
  });
  it("adds to an existing course in one go (one undoable change), after the given slide", () => {
    const base = made().course;
    const r = addPlanToCourse(base, plan(), { at: 2, run: "t2" });
    expect(r.course.steps.length).toBe(base.steps.length * 2);
    expect(r.course.steps[2].id).toBe(r.firstStepId);
    expect(errors(r.course)).toEqual([]);
    expect(r.course.title).toEqual(base.title);
  });
  it("a slide without an instrument, every calc diagram, and odd numbers still give valid, readable slides", () => {
    const p = plan();
    const idea = p.slides.find((s) => s.kind === "idea")!;
    if (idea.kind === "idea") idea.instrument = null;
    const calc = p.slides.find((s) => s.kind === "calc")!;
    const diagrams: Record<string, unknown> = {
      sixtyToOne: {
        kind: "sixtyToOne",
        course: 90,
        flownNm: 30,
        offNm: 4,
        toGoNm: 40,
      },
      windTriangle: {
        kind: "windTriangle",
        course: 360,
        tasKt: 110,
        windDir: 270,
        windKt: 20,
      },
      profile: {
        kind: "profile",
        fromFt: 6000,
        toFt: 2000,
        angleDeg: 3,
        gsKt: 120,
      },
      vdp: { kind: "vdp", mdaFt: 1200, tdzeFt: 400, vdpNm: 2.6 },
      holdWind: {
        kind: "holdWind",
        inbound: 270,
        turn: "R",
        windDir: 300,
        windKt: 25,
        tasKt: 100,
      },
      compass: {
        kind: "compass",
        tc: 90,
        wca: -8,
        variation: -3,
        deviation: 2,
      },
      turn: { kind: "turn", tasKt: 9999, bankDeg: -5 },
    };
    for (const k of CALC_IDS) {
      const q = JSON.parse(JSON.stringify(p)) as DeckPlan;
      const c = q.slides.find((s) => s.kind === "calc")!;
      if (c.kind === "calc") c.diagram = diagrams[k] as never;
      // an aircraft that cannot fly (30 kt, 60° of bank) falls back to the ready situation, with a warning
      const y = q.slides.find((s) => s.kind === "yourTurn")!;
      if (y.kind === "yourTurn")
        Object.assign(y.situation, { speedKt: 30, bankDeg: 60 });
      const r = courseFromPlan(q, {
        id: "ai-c2",
        lang: "en",
        formation: "ir",
        run: `k${k}`,
      });
      expect(errors(r.course), k).toEqual([]);
      for (const lang of LANGS)
        expect(readFails(r.course, lang), `${k} ${lang}`).toEqual([]);
      expect(r.warnings.length, k).toBeGreaterThan(0);
    }
    void calc;
  });
  it("too long texts are cut to fit, and the plan's numbers are clamped", () => {
    const p = plan();
    const long =
      "Une phrase beaucoup trop longue pour tenir sur une diapo, ".repeat(6);
    const idea = p.slides.find((s) => s.kind === "idea")!;
    if (idea.kind === "idea") idea.title = { en: long, fr: long };
    const r = courseFromPlan(p, {
      id: "ai-c3",
      lang: "fr",
      formation: "lapl-ppl",
      run: "t3",
    });
    for (const lang of LANGS) expect(readFails(r.course, lang)).toEqual([]);
    expect(cap("one two three four", 10)).toBe("one two…");
    const sit = situationOf({
      start: "level",
      headingDeg: 725,
      altitudeFt: 99999,
      speedKt: 100,
      verticalSpeedFpm: 0,
      bankDeg: 0,
      powerPct: 58,
      flaps: 0,
    });
    expect(sit.hdg).toBe(5);
    expect(sit.altFt).toBe(14000);
    const g = GOAL_SENTENCES.find((x) => x.id === "holdHeading")!;
    expect(goalChecks(g, sit, 400, 0).all).toEqual([
      { id: "heading", p: { value: 5, tol: 10 } },
    ]);
    expect(goalChecks(g, sit, 5, 999).holdS).toBe(60);
    // the fit pass is idempotent
    const s = r.course.steps.find(
      (x) => x.slide?.layout === "instrumentNotes",
    )!.slide!;
    const before = JSON.stringify(s);
    fitTexts(s);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("the outline lists every slide; reordering and removing edit the plan", () => {
    const o = outlineOf(plan());
    expect(o.map((x) => x.kind)).toEqual(FIXTURE.slides.map((s) => s.kind));
    expect(o[0].view).toBe("six");
    expect(o[0].animation).toBe("stall");
    const e = editPlan(plan(), [7, 0, 3]);
    expect(e.slides.map((s) => s.kind)).toEqual(["recap", "cover", "idea"]);
  });
  it("addStarterDeck takes the mapped deck as it takes a built-in template", () => {
    const m = mapPlan(plan(), { run: "t4" });
    const empty = courseFromPlan(plan(), {
      id: "x",
      lang: "en",
      formation: "lapl-ppl",
      run: "t5",
    }).course;
    const r = addStarterDeck({ ...empty, steps: [] }, m.starter, { at: 0 });
    expect(r.course.steps.length).toBe(FIXTURE.slides.length);
  });
});

// ------------------------------------------------------------------ the key
class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
describe("the customer's API key", () => {
  const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
  it("checks the format lightly", () => {
    expect(keyLooksValid(KEY)).toBe(true);
    expect(keyLooksValid("  " + KEY + "\n")).toBe(true);
    expect(keyLooksValid("sk-proj-123")).toBe(false);
    expect(keyLooksValid("sk-ant-")).toBe(false);
    expect(keyLooksValid("sk-ant-abc def ghi jkl mno")).toBe(false);
  });
  it("stays in memory by default, is remembered only when asked, and is forgotten", () => {
    const st = new MemStorage();
    const k = new KeyStore(() => st);
    k.set(KEY, false);
    expect(k.get()).toBe(KEY);
    expect(st.m.size).toBe(0);
    expect(new KeyStore(() => st).get()).toBe(null);
    k.set(KEY, true);
    expect(st.getItem(KEY_STORAGE)).toBe(KEY);
    const again = new KeyStore(() => st);
    expect(again.get()).toBe(KEY);
    expect(again.remembered).toBe(true);
    again.forget();
    expect(again.get()).toBe(null);
    expect(st.m.size).toBe(0);
    // unticking « Se souvenir » removes the stored copy
    k.set(KEY, true);
    k.set(KEY, false);
    expect(st.m.size).toBe(0);
  });
  it("survives a storage that throws (private window, blocked site data)", () => {
    const k = new KeyStore(() => {
      throw new Error("blocked");
    });
    k.set(KEY, true);
    expect(k.get()).toBe(KEY);
    k.forget();
    expect(k.get()).toBe(null);
  });
  it("is never logged and never put in a URL", () => {
    const src = ["key.ts", "client.ts", "dialog.ts"].map((f) =>
      readFileSync(new URL(`../src/course/ai/${f}`, import.meta.url), "utf8"),
    );
    for (const s of src) {
      expect(s).not.toMatch(/console\.(log|info|debug|warn|error)/);
      expect(s).not.toMatch(
        /[?&]key=|apiKey\)?\s*\+|`[^`]*\$\{\s*(api)?[kK]ey\s*\}[^`]*`/,
      );
    }
  });
});

// ------------------------------------------------------------------ errors
describe("errors in plain words", () => {
  const H = new Headers();
  it("maps the SDK's typed errors", () => {
    expect(
      errorMessage(
        new Anthropic.AuthenticationError(401, undefined, "bad", H),
        Anthropic,
      ).fr,
    ).toBe("Clé refusée");
    expect(
      errorMessage(
        new Anthropic.PermissionDeniedError(403, undefined, "no", H),
        Anthropic,
      ).fr,
    ).toBe("Clé refusée");
    expect(
      errorMessage(
        new Anthropic.RateLimitError(429, undefined, "slow", H),
        Anthropic,
      ).fr,
    ).toBe("Trop de demandes, réessayez dans un instant");
    expect(
      errorMessage(
        new Anthropic.APIConnectionError({ message: "x" }),
        Anthropic,
      ).fr,
    ).toBe("Pas de connexion");
    expect(
      errorMessage(
        new Anthropic.InternalServerError(500, undefined, "boom", H),
        Anthropic,
      ).en,
    ).toMatch(/could not/i);
    expect(errorMessage(new Error("weird"), Anthropic).en).toMatch(
      /could not/i,
    );
  });
});

// ------------------------------------------------------------------ the whole generation, offline
/** A server-sent-events response like the Messages API's, cutting the text into small deltas. */
function sseResponse(text: string, stop = "end_turn"): Response {
  const ev = (type: string, data: object) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const parts: string[] = [
    ev("message_start", {
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: AI_MODEL,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    }),
    ev("content_block_start", {
      index: 0,
      content_block: { type: "text", text: "" },
    }),
  ];
  for (let i = 0; i < text.length; i += 200)
    parts.push(
      ev("content_block_delta", {
        index: 0,
        delta: { type: "text_delta", text: text.slice(i, i + 200) },
      }),
    );
  parts.push(
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", {
      delta: { stop_reason: stop, stop_sequence: null },
      usage: { output_tokens: 99 },
    }),
    ev("message_stop", {}),
  );
  return new Response(parts.join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}
describe("a generation end to end (mocked client, no network)", () => {
  const KEY = "sk-ant-api03-test-key-0123456789";
  const bodies: Record<string, unknown>[] = [];
  const headers: Headers[] = [];
  const factory =
    (resp: () => Response): ClientFactory =>
    async (apiKey) =>
      new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
        maxRetries: 0,
        fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
          bodies.push(JSON.parse(String(init?.body ?? "{}")));
          headers.push(new Headers(init?.headers));
          return resp();
        }) as typeof fetch,
      });
  it("sends the right request and returns the validated plan, with titles as they arrive", async () => {
    const seen: string[][] = [];
    const r = await generatePlan(
      {
        prompt: "Un cours PPL de 8 diapos sur le décrochage",
        formation: "lapl-ppl",
        slides: 8,
        lang: "fr",
      },
      {
        apiKey: KEY,
        clientFactory: factory(() => sseResponse(JSON.stringify(FIXTURE))),
        onTitles: (t) => seen.push(t),
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.slides.length).toBe(8);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)!.length).toBe(8);
    const b = bodies.at(-1)!;
    expect(b.model).toBe("claude-opus-5-5");
    expect(b.output_config).toMatchObject({
      effort: "high",
      format: { type: "json_schema" },
    });
    expect(b.fallbacks).toBe("default");
    expect(b.thinking).toBeUndefined();
    expect(b.temperature).toBeUndefined();
    expect(
      (b.system as { cache_control?: unknown }[])[0].cache_control,
    ).toEqual({ type: "ephemeral" });
    const msgs = b.messages as { role: string }[];
    expect(msgs.at(-1)!.role).toBe("user");
    expect(msgs.length).toBe(1);
    const h = headers.at(-1)!;
    // the SDK sends the key in its auth header (Bearer on this API version), to api.anthropic.com only
    expect(`${h.get("x-api-key") ?? ""} ${h.get("authorization") ?? ""}`).toContain(KEY);
    expect(h.get("anthropic-beta")).toContain(
      "server-side-fallback-2026-07-01",
    );
  });
  it("the request is the same object the client sends", () => {
    const p = requestParams({
      prompt: "x",
      formation: "ir",
      slides: 6,
      lang: "en",
    });
    expect(p.model).toBe(AI_MODEL);
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(p.max_tokens).toBeGreaterThanOrEqual(32000);
  });
  it("a refusal and a cut-off answer are said calmly", async () => {
    const refused = await generatePlan(
      { prompt: "x", formation: "ir", slides: 6, lang: "fr" },
      { apiKey: KEY, clientFactory: factory(() => sseResponse("", "refusal")) },
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toBe("refusal");
      expect(refused.message.fr).toContain(
        "L’assistant n’a pas pu générer ce contenu",
      );
    }
    const cut = await generatePlan(
      { prompt: "x", formation: "ir", slides: 15, lang: "fr" },
      {
        apiKey: KEY,
        clientFactory: factory(() =>
          sseResponse(JSON.stringify(FIXTURE).slice(0, 400), "max_tokens"),
        ),
      },
    );
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.reason).toBe("tooLong");
    const junk = await generatePlan(
      { prompt: "x", formation: "ir", slides: 6, lang: "fr" },
      {
        apiKey: KEY,
        clientFactory: factory(() => sseResponse('{"title":{"en":"x"}}')),
      },
    );
    expect(junk.ok).toBe(false);
    if (!junk.ok) expect(junk.reason).toBe("invalid");
  });
  it("a refused key is « Clé refusée », and Annuler aborts", async () => {
    const r = await generatePlan(
      { prompt: "x", formation: "ir", slides: 6, lang: "fr" },
      {
        apiKey: KEY,
        clientFactory: factory(
          () =>
            new Response(
              JSON.stringify({
                type: "error",
                error: {
                  type: "authentication_error",
                  message: "invalid x-api-key",
                },
              }),
              {
                status: 401,
                headers: { "content-type": "application/json" },
              },
            ),
        ),
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.fr).toBe("Clé refusée");
    const ctl = new AbortController();
    const slow: ClientFactory = async (apiKey) =>
      new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
        maxRetries: 0,
        fetch: ((_u: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_res, rej) => {
            init?.signal?.addEventListener("abort", () =>
              rej(new DOMException("aborted", "AbortError")),
            );
          })) as typeof fetch,
      });
    const p = generatePlan(
      { prompt: "x", formation: "ir", slides: 6, lang: "fr" },
      { apiKey: KEY, clientFactory: slow, signal: ctl.signal },
    );
    setTimeout(() => ctl.abort(), 10);
    const a = await p;
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe("aborted");
  });
  it("« Vérifier » makes one cheap call (the model's card) and says if the key works", async () => {
    const calls: string[] = [];
    const ok = await verifyKey(
      KEY,
      async (apiKey) =>
        new Anthropic({
          apiKey,
          dangerouslyAllowBrowser: true,
          maxRetries: 0,
          fetch: (async (u: RequestInfo | URL) => {
            calls.push(String(u));
            return new Response(
              JSON.stringify({
                id: AI_MODEL,
                type: "model",
                display_name: "Claude Opus 5.5",
                created_at: "2026-01-01T00:00:00Z",
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            );
          }) as typeof fetch,
        }),
    );
    expect(ok.ok).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("/v1/models/claude-opus-5-5");
    expect(calls[0]).not.toContain(KEY);
  });
  it("never runs without a key", async () => {
    const f = vi.fn();
    const r = await generatePlan(
      { prompt: "x", formation: "ir", slides: 6, lang: "fr" },
      { apiKey: "nope", clientFactory: f },
    );
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
