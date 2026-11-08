// Ground school — the Fly-it round trip (SPEC §6.2, §9.2 handoff.ts) and the course's attempt records (§9.8).
//
//   1. the player calls createHandoff() → a Handoff record (token) in IndexedDB, and navigates to flyUrl(token)
//   2. index.html resolves the token (resolveHandoff) and shows the briefing card at once, then flies the step
//      (toExercise.ts flyItPlan / stepToExercise), consumeHandoff() when the flight starts
//   3. the result modal's "Back to the course" calls recordFlyResult() (an AttemptRecord keyed by the token, beside
//      the normal training record) and navigates to handoff.returnUrl → academy.html#play=<id>&s=<step>&a=<token>
//   4. the player opens the step in debrief state: handoffStatus(token) is 'flown' (the attempt), 'notFinished' (the
//      flight started but no result came back: "Flight not finished" + Fly it again), 'pending' or 'missing'
// Tokens are per attempt, so two tabs never overwrite each other's results. A YourTurn { where: 'sim' } on a designed
// slide uses the same path with `&b=<blockId>` in the return URL, and its result is an AttemptRecord kind 'yourTurn'.
// Course attempts (try, quiz, calc, drill) are practice: never ACS-graded, never logged as flights.
import type {
  AttemptRecord,
  CalcGeneratorId,
  CalcParams,
  Course,
  Criterion,
  FlyIt,
  FlyOption,
  Handoff,
  L10n,
  Step,
  YourTurn,
  YourTurnResult,
} from "./types";
import type { CourseStore } from "./store";
import { flyCriteria, yourTurnFlyIt } from "./goals";
import { generate } from "./calc";

export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** tokens older than this are pruned (an abandoned flight is still "not finished" until then) */
export const HANDOFF_MAX_AGE_DAYS = 14;

/** 128 random bits, base64url (22 characters) */
export function newToken(): string {
  const b = new Uint8Array(16);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  )
    crypto.getRandomValues(b);
  else
    for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ------------------------------------------------------------------ URLs
/** index.html?fly=<token> */
export function flyUrl(token: string, page = "index.html"): string {
  return `${page}${page.includes("?") ? "&" : "?"}fly=${encodeURIComponent(token)}`;
}
/** academy.html#play=<courseId>&s=<stepId>[&a=<token>][&b=<blockId>] */
export function courseReturnUrl(
  courseId: string,
  stepId: string,
  token?: string,
  opts: { page?: string; block?: string } = {},
): string {
  const q = [
    `play=${encodeURIComponent(courseId)}`,
    `s=${encodeURIComponent(stepId)}`,
  ];
  if (token) q.push(`a=${encodeURIComponent(token)}`);
  if (opts.block) q.push(`b=${encodeURIComponent(opts.block)}`);
  return `${opts.page ?? "academy.html"}#${q.join("&")}`;
}
/**
 * A return URL must stay on this site: a relative path (academy.html#…, ./academy.html, /ifr/academy.html) or an
 * absolute URL on `origin`. Anything else (another host, javascript:, data:, protocol-relative //, a backslash that
 * browsers read as a slash: '/\evil.example') is refused so a crafted link or token record cannot turn the result
 * button into an open redirect. Every input, relative included, is resolved the way the browser will resolve it
 * (new URL(url, origin)) and must land on `origin` over http(s).
 */
export function isSafeReturnUrl(url: string, origin?: string): boolean {
  if (typeof url !== "string" || !url || url.length > 2048) return false;
  // leading spaces, control characters (tab and newline are stripped by the URL parser) and any backslash
  if (/^\s|[\u0000-\u001f\u007f\\]/.test(url)) return false;
  // without an http(s) origin (tests, a worker, a file:// page whose origin is "null"), resolve against a
  // placeholder: only a same-site relative path passes
  const base =
    origin && /^https?:\/\/[^/]+$/i.test(origin)
      ? origin
      : "https://same-site.invalid";
  try {
    const u = new URL(url, base);
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      u.origin === new URL(base).origin
    );
  } catch {
    return false;
  }
}
export interface PlayHash {
  play?: string;
  s?: string;
  a?: string;
  b?: string;
}
/** read #play=<id>&s=<step>&a=<token>&b=<block> (the player's return state) */
export function parsePlayHash(hash: string): PlayHash {
  const out: PlayHash = {};
  const h = hash.replace(/^#/, "");
  for (const part of h.split("&")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i);
    if (k !== "play" && k !== "s" && k !== "a" && k !== "b") continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1));
    } catch {
      /* malformed: ignored */
    }
  }
  return out;
}

// ------------------------------------------------------------------ create / resolve / consume
export interface CreateHandoffInput {
  course: Course;
  step: Step;
  /** instructor options on for this attempt (default: flyIt.defaultsOn) */
  options?: FlyOption[];
  /** where "Back to the course" goes (default courseReturnUrl(course, step, token)) */
  returnUrl?: string;
  /** a 'calc' target: the problem the student solved (same seed, same numbers in the cockpit) */
  calc?: { generatorId: CalcGeneratorId; seed: number; params: CalcParams };
  /** a designed slide's YourTurn { where: 'sim' }: the block holding it */
  yourTurn?: { block: string; yourTurn: YourTurn; sceneId: string };
  /** academy page name for the default return URL */
  page?: string;
}
export type HandoffError =
  | "noFlyIt"
  | "calcMissing"
  | "unsafeReturn"
  | "storage";
export class HandoffCreateError extends Error {
  constructor(
    readonly code: HandoffError,
    readonly text: L10n,
  ) {
    super(text.en);
    this.name = "HandoffCreateError";
  }
}

/** Write the token record for a Fly it (or a sim YourTurn) and return it. Throws HandoffCreateError. */
export async function createHandoff(
  store: CourseStore,
  input: CreateHandoffInput,
  now: Date = new Date(),
): Promise<Handoff> {
  const { course, step } = input;
  let fly: FlyIt | undefined = step.flyIt;
  if (input.yourTurn)
    fly = yourTurnFlyIt(input.yourTurn.yourTurn, input.yourTurn.sceneId);
  if (!fly)
    throw new HandoffCreateError("noFlyIt", {
      en: "This step has nothing to fly",
      fr: "Cette étape n’a rien à voler",
    });
  if (fly.target.kind === "calc" && !input.calc)
    throw new HandoffCreateError("calcMissing", {
      en: "Solve the calculation first: the flight uses your numbers",
      fr: "Faites d’abord le calcul : le vol reprend vos valeurs",
    });
  const token = newToken();
  const returnUrl =
    input.returnUrl ??
    courseReturnUrl(course.id, step.id, token, {
      page: input.page,
      block: input.yourTurn?.block,
    });
  if (
    !isSafeReturnUrl(
      returnUrl,
      typeof location !== "undefined" ? location.origin : undefined,
    )
  )
    throw new HandoffCreateError("unsafeReturn", {
      en: "The return address is not on this site",
      fr: "L’adresse de retour n’est pas sur ce site",
    });
  const offered = new Set(fly.options);
  const options = (input.options ?? fly.defaultsOn ?? []).filter((o) =>
    offered.has(o),
  );
  // a calc target's criteria come from the problem the student solved (its stage goals) when the author wrote none:
  // the cockpit's brief card and the course's debrief then list the same goals
  let calcProblem: ReturnType<typeof generate> | undefined;
  if (fly.target.kind === "calc" && input.calc) {
    try {
      calcProblem = generate(
        input.calc.generatorId,
        input.calc.seed,
        input.calc.params,
      );
    } catch {
      calcProblem = undefined;
    }
  }
  const criteria: Criterion[] = flyCriteria(fly, calcProblem);
  const h: Handoff = {
    token,
    courseId: course.id,
    rev: course.rev,
    stepId: step.id,
    target: structuredClone(fly.target),
    options,
    criteria: structuredClone(criteria),
    ...(fly.brief ? { brief: fly.brief } : {}),
    returnUrl,
    created: now.toISOString(),
    ...(input.calc ? { calc: structuredClone(input.calc) } : {}),
  };
  try {
    await store.putHandoff(h);
  } catch (e) {
    throw new HandoffCreateError("storage", {
      en: `Could not prepare the flight: ${(e as Error)?.message ?? e}`,
      fr: `Impossible de préparer le vol : ${(e as Error)?.message ?? e}`,
    });
  }
  return h;
}

export type HandoffState = "pending" | "consumed" | "missing" | "expired";
export interface ResolvedHandoff {
  state: HandoffState;
  handoff: Handoff | null;
  course: Course | null;
  /** the step flown (a top-level step, or a briefing step inside a Fly it) */
  step: Step | null;
  /** the course changed since the token was made (the cockpit still flies the token's copy of the target) */
  courseChanged: boolean;
}
function findStep(steps: Step[], id: string): Step | null {
  for (const s of steps) {
    if (s.id === id) return s;
    const inner = s.flyIt?.briefing ? findStep(s.flyIt.briefing, id) : null;
    if (inner) return inner;
  }
  return null;
}
/** index.html?fly=<token>: what to brief and fly. */
export async function resolveHandoff(
  store: CourseStore,
  token: string,
  now: Date = new Date(),
  /** courses that are not stored (the shipped samples) */
  lookup?: (courseId: string) => Course | null | Promise<Course | null>,
): Promise<ResolvedHandoff> {
  const none: ResolvedHandoff = {
    state: "missing",
    handoff: null,
    course: null,
    step: null,
    courseChanged: false,
  };
  if (!TOKEN_RE.test(token)) return none;
  const h = await store.getHandoff(token);
  if (!h) return none;
  const course =
    (await store.get(h.courseId).catch(() => null)) ??
    (lookup ? await lookup(h.courseId) : null);
  const step = course ? findStep(course.steps, h.stepId) : null;
  const age = (now.getTime() - Date.parse(h.created)) / 86_400_000;
  const state: HandoffState =
    age > HANDOFF_MAX_AGE_DAYS
      ? "expired"
      : h.consumed
        ? "consumed"
        : "pending";
  return {
    state,
    handoff: h,
    course,
    step,
    courseChanged: !!course && course.rev !== h.rev,
  };
}
/** The flight started: mark the token (an unfinished flight then reads "Flight not finished"). */
export async function consumeHandoff(
  store: CourseStore,
  token: string,
  now: Date = new Date(),
): Promise<Handoff | null> {
  const h = await store.getHandoff(token);
  if (!h) return null;
  if (!h.consumed) {
    h.consumed = now.toISOString();
    await store.putHandoff(h);
  }
  return h;
}

// ------------------------------------------------------------------ results
export interface FlyResultInput {
  profileId: string;
  passed: boolean;
  selfGrade: "nailed" | "close" | "notyet";
  criteria: { id: string; met: boolean; worst?: string; atS?: number }[];
  /** seconds flown */
  secs: number;
  /** history.ts training record id */
  historyId?: string;
  procResults?: unknown[];
  cfiNote?: string;
  /** stopped before the end: nothing was graded */
  ungraded?: boolean;
}
/** the storage key of the one attempt a token can produce */
export const flyAttemptKey = (
  h: Pick<Handoff, "courseId" | "stepId" | "token">,
  profileId: string,
) => `${h.courseId}|${profileId}|${h.stepId}|fly|${h.token}`;

/** "Back to the course": the Fly-it attempt, keyed by the token (recording again updates it, e.g. the self-grade). */
export async function recordFlyResult(
  store: CourseStore,
  token: string,
  r: FlyResultInput,
  now: Date = new Date(),
): Promise<AttemptRecord | null> {
  const h = await store.getHandoff(token);
  if (!h) return null;
  const key = flyAttemptKey(h, r.profileId);
  const prev = await store.getAttempt(key);
  const known = new Set(h.criteria.map((c) => c.id));
  const a: AttemptRecord = {
    courseId: h.courseId,
    rev: h.rev,
    stepId: h.stepId,
    profileId: r.profileId,
    at: prev?.at ?? now.toISOString(),
    secs: Math.max(0, Math.round(r.secs)),
    kind: "fly",
    goalMet: r.passed,
    fly: {
      token,
      passed: r.passed,
      selfGrade: r.selfGrade,
      // the token's criteria only (a lesson target has none: the engine grades and the list is empty)
      criteria: r.criteria.filter((c) => !known.size || known.has(c.id)),
      ...(r.historyId ? { historyId: r.historyId } : {}),
      ...(r.procResults ? { procResults: r.procResults } : {}),
      ...(r.ungraded ? { ungraded: true } : {}),
    },
    ...(r.cfiNote ? { cfiNote: r.cfiNote } : {}),
  };
  if (!h.consumed) h.consumed = now.toISOString();
  await store.putHandoff(h);
  await store.addAttempt(a, key);
  return a;
}
/** A sim YourTurn came back: AttemptRecord kind 'yourTurn' (practice unless its goal is graded and unassisted). */
export async function recordYourTurnResult(
  store: CourseStore,
  input: {
    course: Course;
    stepId: string;
    block: string;
    profileId: string;
    result: YourTurnResult;
    graded?: boolean;
  },
  now: Date = new Date(),
): Promise<AttemptRecord> {
  const a: AttemptRecord = {
    courseId: input.course.id,
    rev: input.course.rev,
    stepId: input.stepId,
    profileId: input.profileId,
    at: now.toISOString(),
    secs: Math.max(0, Math.round(input.result.secs)),
    kind: "yourTurn",
    goalMet: input.result.met,
    checks: [...input.result.checks],
    ...(input.graded ? { practiceGraded: true } : {}),
    yourTurn: { block: input.block, result: structuredClone(input.result) },
  };
  await store.addAttempt(
    a,
    input.result.token
      ? `${a.courseId}|${a.profileId}|${a.stepId}|yourTurn|${input.result.token}`
      : undefined,
  );
  return a;
}
/**
 * Any other course attempt (an answer, a Try it, a calc, a drill). Calc and drill attempts are practice: the
 * record never carries practiceGraded, and a drill keeps its practice-only nature.
 */
export async function recordAttempt(
  store: CourseStore,
  a: AttemptRecord,
): Promise<string> {
  const rec: AttemptRecord = structuredClone(a);
  if (rec.kind === "calc" || rec.kind === "drill") delete rec.practiceGraded;
  if (rec.kind === "drill" && rec.drill)
    rec.correct = rec.drill.correct === rec.drill.count;
  return store.addAttempt(rec);
}

export type FlyStatus =
  | { status: "flown"; attempt: AttemptRecord }
  | { status: "notFinished"; handoff: Handoff }
  | { status: "pending"; handoff: Handoff }
  | { status: "missing" };
/** The player's debrief state for #a=<token>. */
export async function handoffStatus(
  store: CourseStore,
  token: string,
  profileId: string,
): Promise<FlyStatus> {
  const h = TOKEN_RE.test(token) ? await store.getHandoff(token) : null;
  if (!h) return { status: "missing" };
  const a = await store.getAttempt(flyAttemptKey(h, profileId));
  if (a) return { status: "flown", attempt: a };
  return h.consumed
    ? { status: "notFinished", handoff: h }
    : { status: "pending", handoff: h };
}
/** Remove token records older than maxAgeDays (their attempts stay). Returns how many were removed. */
export async function pruneHandoffs(
  store: CourseStore,
  maxAgeDays = HANDOFF_MAX_AGE_DAYS,
  now: Date = new Date(),
): Promise<number> {
  let n = 0;
  for (const h of await store.listHandoffs())
    if (
      (now.getTime() - Date.parse(h.created)) / 86_400_000 > maxAgeDays ||
      Number.isNaN(Date.parse(h.created))
    ) {
      await store.deleteHandoff(h.token);
      n++;
    }
  return n;
}
