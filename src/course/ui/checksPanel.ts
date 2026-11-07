// Ground school editor (package F): the checks panel (SPEC §5, A7). Never blocking: the pacing rule (4 steps in a row
// without a student action), missing French text, stale AIRAC data, plus the validator's content errors (a missing
// scene, alt text…) and its advisories. Pure part (editorChecks, pacingRuns, airacCycle) is unit-tested; the panel
// is a small DOM list whose rows jump to the step.
import type { Course, L10n, Lang, Step } from "../types";
import {
  courseAdvisories,
  hasStudentAction,
  validateCourse,
  COURSE_LIMITS,
  STRUCTURAL,
  type CourseIssue,
  type ValidateContext,
} from "../validate";
import { h } from "../../ui/dom";
import { readIssueText, slideReadability } from "../canvas/readability";
import { resolveTheme } from "../canvas/themes";

const L = (en: string, fr: string): L10n => ({ en, fr });
const tr = (t: L10n, lang: Lang) => (lang === "fr" ? (t.fr ?? t.en) : t.en);

// ------------------------------------------------------------------ AIRAC
/** AIRAC 2001 became effective on 2 January 2020; cycles are 28 days. */
const AIRAC_EPOCH = Date.UTC(2020, 0, 2);
const DAY = 86_400_000;
const CYCLE = 28 * DAY;
/** The AIRAC cycle in force on a date: "2611" (YY + cycle number in that year). */
export function airacCycle(d: Date = new Date()): string {
  const k = Math.floor((d.getTime() - AIRAC_EPOCH) / CYCLE);
  const eff = AIRAC_EPOCH + k * CYCLE;
  const y = new Date(eff).getUTCFullYear();
  // first cycle of that year: the first effective date on or after 1 January
  const jan1 = Date.UTC(y, 0, 1);
  const firstK = Math.ceil((jan1 - AIRAC_EPOCH) / CYCLE);
  const nn = k - firstK + 1;
  return `${String(y % 100).padStart(2, "0")}${String(nn).padStart(2, "0")}`;
}
/** Index of a cycle id on the 28-day grid (for "how many cycles old"); null if it is not a YYNN id. */
export function airacIndex(id: string): number | null {
  const m = /^(\d{2})(\d{2})$/.exec(id.trim());
  if (!m) return null;
  const y = 2000 + Number(m[1]);
  const nn = Number(m[2]);
  if (nn < 1 || nn > 14) return null;
  const firstK = Math.ceil((Date.UTC(y, 0, 1) - AIRAC_EPOCH) / CYCLE);
  return firstK + nn - 1;
}
/** Cycles between a recorded AIRAC and the current one (0 = current; null when unknown). */
export function airacAge(recorded: string, current: string): number | null {
  const a = airacIndex(recorded);
  const b = airacIndex(current);
  return a === null || b === null ? null : b - a;
}

// ------------------------------------------------------------------ pacing
/** Runs of ≥ pacingRun consecutive steps without a student action, as step indices [from, to]. */
export function pacingRuns(
  steps: readonly Step[],
  min: number = COURSE_LIMITS.pacingRun,
): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  steps.forEach((s, i) => {
    if (hasStudentAction(s)) {
      if (start >= 0 && i - start >= min) out.push([start, i - 1]);
      start = -1;
    } else if (start < 0) start = i;
  });
  if (start >= 0 && steps.length - start >= min)
    out.push([start, steps.length - 1]);
  return out;
}
/** The left column's amber advisory: "Steps 8 to 11 explain without a task. A Try it in between keeps students doing." */
export function pacingText(run: [number, number], lang: Lang): string {
  const [a, b] = [run[0] + 1, run[1] + 1];
  return lang === "fr"
    ? `Les étapes ${a} à ${b} expliquent sans tâche. Un « À vous » au milieu garde l’élève actif.`
    : `Steps ${a} to ${b} explain without a task. A Try it in between keeps students doing.`;
}

// ------------------------------------------------------------------ the checks
export type CheckCode = CourseIssue["code"] | "airac" | "readability";
export interface EditorCheck {
  level: "error" | "warn";
  code: CheckCode;
  message: L10n;
  stepId?: string;
  blockId?: string;
  path?: string;
  /** step range of a pacing run (indices) */
  run?: [number, number];
}
export interface ChecksContext extends ValidateContext {
  /** today (tests) */
  now?: Date;
  /** the AIRAC of the loaded nav data (default: the cycle in force today) */
  airac?: string;
  /** bytes of the course's images (the size meter) */
  assetBytes?: number;
}

function stepIdOfPath(course: Course, path: string): string | undefined {
  const m = /^steps\[(\d+)\]/.exec(path);
  return m ? course.steps[Number(m[1])]?.id : undefined;
}

/** Everything the checks panel lists, errors first, then advisories in course order. */
export function editorChecks(
  course: Course,
  ctx: ChecksContext = {},
): EditorCheck[] {
  const out: EditorCheck[] = [];
  const seen = new Set<string>();
  const push = (c: EditorCheck) => {
    const k = `${c.code}|${c.stepId ?? ""}|${c.blockId ?? ""}|${c.message.en}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  // validator errors (content errors do not block a draft; structural ones never reach the editor)
  for (const i of validateCourse(course, ctx))
    if (i.level === "error" && !STRUCTURAL.has(i.code))
      push({
        level: "error",
        code: i.code,
        message: i.message,
        stepId: i.stepId ?? stepIdOfPath(course, i.path),
        blockId: i.blockId,
        path: i.path,
      });
  // pacing with the step range (the validator's message names only the first step)
  for (const run of pacingRuns(course.steps))
    push({
      level: "warn",
      code: "pacing",
      run,
      stepId: course.steps[run[0]].id,
      message: L(pacingText(run, "en"), pacingText(run, "fr")),
    });
  for (const i of courseAdvisories(course, {
    ...ctx,
    assetBytes: ctx.assetBytes,
  }))
    if (i.code !== "pacing")
      push({
        level: "warn",
        code: i.code,
        message: i.message,
        stepId: i.stepId ?? stepIdOfPath(course, i.path),
        blockId: i.blockId,
        path: i.path,
      });
  // readability on a projector (SPEC slides v2 §13): text under 24 px at 1920, words that cannot fit their frame,
  // blocks off the slide or on top of each other, diagram labels on top of each other — in every language
  const theme = resolveTheme(course.theme, course.brand);
  const seenRead = new Set<string>();
  for (const s of course.steps) {
    if (!s.slide) continue;
    for (const lang of (course.langs?.length ? course.langs : ["en", "fr"]) as Lang[]) {
      let issues: ReturnType<typeof slideReadability> = [];
      try {
        issues = slideReadability(s.slide, { theme, lang, diagrams: typeof document !== "undefined" });
      } catch {
        issues = [];
      }
      for (const i of issues) {
        const k = `${s.id}|${i.blockId}|${i.kind}`;
        if (seenRead.has(k)) continue;
        seenRead.add(k);
        push({
          level: "warn",
          code: "readability",
          stepId: s.id,
          blockId: i.blockId,
          message: readIssueText(i, lang),
        });
      }
    }
  }
  // stale AIRAC: scenes and plates recorded with an older cycle than the data loaded today
  const current = ctx.airac ?? airacCycle(ctx.now ?? new Date());
  const stale = (rec: string | undefined) => {
    if (!rec) return null;
    const age = airacAge(rec, current);
    return age !== null && age > 0 ? age : null;
  };
  const worldAirac =
    course.world.kind === "real" ? course.world.airac : undefined;
  const wAge = stale(worldAirac);
  if (wAge)
    push({
      level: "warn",
      code: "airac",
      message: L(
        `The course was written with AIRAC ${worldAirac}; the data is now ${current}. Check procedures and frequencies.`,
        `Le cours a été écrit avec l’AIRAC ${worldAirac} ; les données sont maintenant en ${current}. Vérifiez procédures et fréquences.`,
      ),
    });
  const sceneUse = new Map<string, string>();
  for (const s of course.steps) {
    const ids = [
      s.stage?.scene,
      s.slide?.scene,
      s.flyIt?.target.kind === "scene" ? s.flyIt.target.scene : undefined,
    ];
    for (const b of s.slide?.blocks ?? [])
      if ((b.kind === "instrument" || b.kind === "simViewport") && b.scene)
        ids.push(b.scene);
    for (const id of ids) if (id && !sceneUse.has(id)) sceneUse.set(id, s.id);
  }
  for (const [id, sc] of Object.entries(course.scenes)) {
    const age = stale(sc.refs?.airac);
    if (!age || !sceneUse.has(id)) continue;
    push({
      level: "warn",
      code: "airac",
      stepId: sceneUse.get(id),
      message: L(
        `Scene “${sc.label ?? id}” captured with AIRAC ${sc.refs!.airac} (${age} cycle${age > 1 ? "s" : ""} old): recapture it`,
        `Scène « ${sc.label ?? id} » capturée avec l’AIRAC ${sc.refs!.airac} (${age} cycle${age > 1 ? "s" : ""} de retard) : recapturez-la`,
      ),
    });
  }
  course.steps.forEach((s) => {
    const plates = [
      ...(s.stage?.panes ?? []).flatMap((p) =>
        p.kind === "diagram" ? [p.d] : [],
      ),
      ...s.reader.flatMap((b) => (b.t === "diagram" ? [b.d] : [])),
      ...(s.slide?.blocks ?? []).flatMap((b) =>
        b.kind === "diagram" && b.d ? [b.d] : [],
      ),
    ];
    for (const d of plates)
      if (d.kind === "plate" && stale(d.airac))
        push({
          level: "warn",
          code: "airac",
          stepId: s.id,
          message: L(
            `Plate ${d.approachId} is from AIRAC ${d.airac}; the data is now ${current}`,
            `La carte ${d.approachId} date de l’AIRAC ${d.airac} ; les données sont en ${current}`,
          ),
        });
  });
  const rank = (c: EditorCheck) => (c.level === "error" ? 0 : 1);
  const order = new Map(course.steps.map((s, i) => [s.id, i]));
  return out
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        rank(a.c) - rank(b.c) ||
        (order.get(a.c.stepId ?? "") ?? -1) -
          (order.get(b.c.stepId ?? "") ?? -1) ||
        a.i - b.i,
    )
    .map((x) => x.c);
}
/** Checks that concern one step (the step list's dot). */
export function checksForStep(
  checks: EditorCheck[],
  stepId: string,
): EditorCheck[] {
  return checks.filter((c) => c.stepId === stepId && c.code !== "pacing");
}

// ------------------------------------------------------------------ the panel (DOM)
const CODE_LABEL: Partial<Record<CheckCode, L10n>> = {
  pacing: L("Pacing", "Rythme"),
  readability: L("Projector", "Projection"),
  fr: L("French", "Français"),
  airac: L("AIRAC", "AIRAC"),
  alt: L("Alt text", "Texte alternatif"),
  attribution: L("Credit", "Crédit"),
  plate: L("Plate", "Carte"),
  wording: L("Wording", "Formulation"),
  "ref.scene": L("Scene", "Scène"),
  "ref.clip": L("Clip", "Séquence"),
  "ref.asset": L("Image", "Image"),
  graded: L("Grading", "Notation"),
  flyCriteria: L("Fly it", "En vol"),
  flyReturn: L("Fly it", "En vol"),
  size: L("Size", "Taille"),
};

export interface ChecksPanelOptions {
  lang: Lang;
  onGoto(stepId: string, blockId?: string): void;
  onClose?(): void;
}
export class ChecksPanel {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private head: HTMLElement;
  constructor(private o: ChecksPanelOptions) {
    this.head = h("div", { class: "ce-checks-head" });
    this.list = h("ol", { class: "ce-checks-list" });
    this.el = h(
      "section",
      {
        class: "ce-checks",
        role: "region",
        "aria-label": o.lang === "fr" ? "Vérifications" : "Checks",
      },
      this.head,
      this.list,
    );
  }
  setLang(l: Lang) {
    this.o.lang = l;
  }
  render(course: Course, checks: EditorCheck[]) {
    const lang = this.o.lang;
    const fr = lang === "fr";
    const errs = checks.filter((c) => c.level === "error").length;
    const warns = checks.length - errs;
    const close = this.o.onClose
      ? h(
          "button",
          {
            type: "button",
            class: "ce-btn sm ghost",
            onclick: () => this.o.onClose?.(),
          },
          fr ? "Fermer" : "Close",
        )
      : null;
    this.head.replaceChildren(
      h("b", {}, fr ? "Vérifications" : "Checks"),
      h(
        "span",
        { class: "ce-muted" },
        checks.length
          ? [
              errs
                ? `${errs} ${fr ? (errs > 1 ? "à corriger" : "à corriger") : errs > 1 ? "to fix" : "to fix"}`
                : "",
              warns
                ? `${warns} ${fr ? (warns > 1 ? "conseils" : "conseil") : warns > 1 ? "advisories" : "advisory"}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : fr
            ? "Rien à signaler"
            : "All clear",
      ),
      h("span", { class: "ce-sp" }),
      ...(close ? [close] : []),
    );
    const index = new Map(course.steps.map((s, i) => [s.id, i]));
    this.list.replaceChildren(
      ...checks.map((c) => {
        const i = c.stepId !== undefined ? index.get(c.stepId) : undefined;
        const where = c.run
          ? `${c.run[0] + 1}–${c.run[1] + 1}`
          : i !== undefined
            ? String(i + 1)
            : "";
        const row = h(
          "li",
          { class: `ce-check ${c.level}` },
          h("span", { class: "ce-check-dot", "aria-hidden": "true" }),
          h(
            "div",
            { class: "ce-check-body" },
            h(
              "span",
              { class: "ce-check-code" },
              `${tr(CODE_LABEL[c.code] ?? L(c.code, c.code), lang)}${where ? ` · ${fr ? "étape" : "step"} ${where}` : ""}`,
            ),
            h("span", {}, tr(c.message, lang)),
          ),
        );
        if (c.stepId) {
          const b = h(
            "button",
            {
              type: "button",
              class: "ce-check-go",
              onclick: () => this.o.onGoto(c.stepId!, c.blockId),
            },
            fr ? "Voir" : "Show",
          );
          row.append(b);
        }
        return row;
      }),
    );
    if (!checks.length)
      this.list.append(
        h(
          "li",
          { class: "ce-check ok" },
          h("span", { class: "ce-check-dot", "aria-hidden": "true" }),
          h(
            "div",
            { class: "ce-check-body" },
            fr
              ? "Aucun problème : texte traduit, rythme varié, données à jour."
              : "Nothing to fix: translated, well paced, data current.",
          ),
        ),
      );
  }
}
