// academy.html and the editor's Test as student — "Your turn" on a designed slide (SPEC nesting rules): the runner the academy uses when the build has
// no dedicated one (course/yourTurn.ts, package Q). The slide's instrument becomes a live Try-it stage over the slide
// (same player, same goal tracker, same controls and assist), the goal is checked live, and the result comes back:
// the slide's yourTurnDone reveal fires, checklist rows tick, bound values show, and an AttemptRecord of kind
// 'yourTurn' is stored (practice unless the goal is graded and unassisted).
import type {
  Course,
  Lang,
  SlideBlock,
  Step,
  YourTurn,
  YourTurnResult,
} from "../types";
import type { CourseStore } from "../store";
import type { SlideBinding } from "../types";
import { renderSlide, type SlideView } from "../canvas/render";
import type { SlideRenderer } from "./player";
import { h } from "../../ui/dom";
import { ct, loc } from "../i18n";
import { doThisFor, paneOfView } from "./templates";

export interface YourTurnCtx {
  course: Course;
  step: Step;
  block: SlideBlock;
  yt: YourTurn;
  store: CourseStore | null;
  lang: Lang;
  /** the player the slide is in (detached while the Your turn runs, so its keys do not move the slide) */
  playerEl: HTMLElement | null;
}

/** The id of the Try-it step a Your turn runs as (attempts are recorded under it, then under the slide). */
export const yourTurnStepId = (stepId: string, blockId: string): string =>
  `${stepId}~yt~${blockId}`;

/** The Try-it step a slide's Your turn stands for: the block's instrument live, its controls, assist and goal. Pure. */
export function yourTurnStep(
  c: Pick<YourTurnCtx, "course" | "step" | "block" | "yt">,
): Step {
  const b = c.block;
  const view =
    b.kind === "instrument"
      ? b.view
      : ({ kind: "gauge", gauge: "hsi" } as const);
  const pane = paneOfView(view, c.course.cockpit);
  const scene =
    c.yt.scene ??
    (b.kind === "instrument" || b.kind === "simViewport"
      ? b.scene
      : undefined) ??
    c.step.slide?.scene;
  const controls =
    c.yt.controls ?? (b.kind === "instrument" ? b.controls : undefined) ?? [];
  return {
    id: yourTurnStepId(c.step.id, b.id),
    kind: "try",
    title: c.yt.prompt,
    reader: [doThisFor(c.yt.goal.all)],
    stage: {
      panes: [pane],
      mode: "live",
      ...(scene ? { scene } : {}),
      ...(controls.length ? { controls: [...controls] } : {}),
      ...(controls.includes("dragAircraft") ? { inset: "plan" as const } : {}),
      ...(c.yt.assist ? { assist: { ...c.yt.assist } } : {}),
      ...(b.kind === "instrument" && b.annotations
        ? {
            annotations: b.annotations.map((a) => ({ ...a, pane: 0 as const })),
          }
        : {}),
      ...(b.kind === "instrument" && b.covers ? { covers: [...b.covers] } : {}),
      ...(b.kind === "instrument" && b.failures
        ? { failuresOnEnter: { ...b.failures } }
        : {}),
    },
    goal: structuredClone(c.yt.goal),
    ...(c.yt.hint ? { hint: c.yt.hint } : {}),
    ...(c.yt.showMe ? { showMe: c.yt.showMe } : {}),
  };
}
/** A Your turn counts as graded only when its goal says so and no assist helps (SPEC §4.3). Pure. */
export const yourTurnGraded = (yt: YourTurn): boolean =>
  !!yt.goal.graded &&
  !(
    yt.assist?.holdAlt ||
    yt.assist?.holdIas ||
    (yt.assist?.timeScale ?? 1) > 1
  );

/**
 * Run a slide's Your turn over `root` and resolve with its result when the student comes back (null for a 'sim'
 * Your turn, which needs the cockpit bridge: the caller tells the student).
 */
export async function runSlideYourTurn(
  c: YourTurnCtx,
  root: HTMLElement,
): Promise<YourTurnResult | null> {
  if (c.yt.where === "sim") return null;
  const { playCourse } = await import("./player");
  const { recordYourTurnResult } = await import("../handoff");
  const synth = yourTurnStep(c);
  const nested: Course = { ...c.course, steps: [synth] };
  const outer = c.playerEl;
  const marker = document.createComment("your turn");
  outer?.replaceWith(marker);
  const started = new Date().toISOString();
  const t0 = performance.now();
  return new Promise((resolve) => {
    let met = false;
    let checks: boolean[] = c.yt.goal.all.map(() => false);
    const done = h(
      "button",
      { class: "gl-primary sm", type: "button" },
      ct("backToSlide", c.lang),
    );
    const overlay = h(
      "div",
      {
        class: "ga-yt",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": loc(c.yt.prompt, c.lang),
      },
      h(
        "div",
        { class: "ga-yt-bar" },
        h("span", { class: "ga-yt-k" }, ct("yourTurn", c.lang)),
        h("b", {}, loc(c.step.title, c.lang)),
        h("span", { class: "ga-sp" }),
        done,
      ),
    );
    const host = h("div", { class: "ga-yt-host" });
    overlay.append(host);
    root.append(overlay);
    const unsub = c.store?.onChange((ch) => {
      if (ch.store !== "attempts" || !c.store) return;
      void c.store
        .listAttempts({ courseId: c.course.id, stepId: synth.id })
        .then((list) => {
          const last = list.filter((a) => a.at >= started).at(-1);
          if (last?.goalMet) {
            met = true;
            checks = last.checks?.length ? last.checks : checks.map(() => true);
            done.classList.add("is-met");
          }
        });
    });
    let closed = false;
    const finish = async () => {
      if (closed) return;
      closed = true;
      unsub?.();
      player.destroy();
      overlay.remove();
      if (outer) marker.replaceWith(outer);
      else marker.remove();
      const result: YourTurnResult = {
        met,
        checks,
        secs: (performance.now() - t0) / 1000,
      };
      if (c.store)
        await recordYourTurnResult(c.store, {
          course: c.course,
          stepId: c.step.id,
          block: c.block.id,
          profileId: "local",
          result,
          graded: yourTurnGraded(c.yt),
        }).catch(() => null);
      resolve(result);
    };
    const player = playCourse(host, {
      course: nested,
      store: c.store,
      lang: c.lang,
      profileId: "local",
      mode: ct("yourTurn", c.lang),
      onExit: () => void finish(),
    });
    done.addEventListener("click", () => void finish());
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") void finish();
    });
    requestAnimationFrame(() => done.focus());
  });
}

export interface YourTurnRendererOptions {
  store: CourseStore | null;
  /** the player element the slide is in (detached while the Your turn runs) */
  playerEl(): HTMLElement | null;
  /** where the Your-turn overlay is mounted */
  root(): HTMLElement;
  /** a runner that replaces the built-in one (academy: package Q when the build has it) */
  run?(c: YourTurnCtx): Promise<YourTurnResult | null>;
  /** tell the student something (a 'sim' Your turn outside the cockpit) */
  notify?(text: string): void;
}

/** The slide renderer with Your turn wired (academy player, presenter, and the editor's Test as student). */
export function yourTurnSlideRenderer(o: YourTurnRendererOptions): SlideRenderer {
  const results = new Map<string, YourTurnResult>();
  const run = async (c: YourTurnCtx): Promise<YourTurnResult | null> => {
    if (o.run) return o.run(c);
    if (c.yt.where === "sim") {
      o.notify?.(ct("yourTurnSim", c.lang));
      return null;
    }
    return runSlideYourTurn(c, o.root());
  };
  return (ctx) => {
    const el = h("div", { class: "cp-slide" });
    // eslint-disable-next-line prefer-const
    let v: SlideView;
    const bind = (b: SlideBinding): string | null => {
      if (b.k !== "yourTurn") return null;
      const r = results.get(`${b.step ?? ctx.step.id}|${b.block}`);
      if (!r) return null;
      if (b.field === "met")
        return ctx.lang === "fr" ? (r.met ? "réussi" : "pas encore") : r.met ? "done" : "not yet";
      if (b.field === "secs") return `${Math.round(r.secs)} s`;
      return (b.key ? r.worst?.[b.key] : Object.values(r.worst ?? {})[0]) ?? null;
    };
    v = renderSlide(ctx.step.slide, el, {
      mode: "play",
      lang: ctx.lang,
      theme: ctx.course.theme,
      brand: ctx.course.brand,
      scenes: ctx.course.scenes,
      cockpit: ctx.course.cockpit,
      assetUrl: ctx.env.assetUrl,
      step: ctx.step,
      reveal: ctx.reveal,
      label: loc(ctx.step.title, ctx.lang),
      calcProblem: (sid) => ctx.calcProblem?.(sid) ?? null,
      onAction: (a) => ctx.onAction(a),
      binding: bind,
      onYourTurn: (b, yt) =>
        void run({
          course: ctx.course,
          step: ctx.step,
          block: b,
          yt,
          store: o.store,
          lang: ctx.lang,
          playerEl: o.playerEl(),
        }).then((r) => {
          if (!r) return;
          results.set(`${ctx.step.id}|${b.id}`, r);
          v.setChecks(r.checks);
          v.fire("yourTurnDone");
          ctx.announce(
            r.met
              ? ct("yourTurnMet", ctx.lang, { t: loc(yt.prompt, ctx.lang) })
              : loc(yt.prompt, ctx.lang),
          );
          v.update(ctx.step.slide);
        }),
    });
    return {
      el,
      next: () => v.next(),
      prev: () => v.prev(),
      setLang: (l) => v.setLang(l),
      destroy: () => v.destroy(),
    };
  };
}
