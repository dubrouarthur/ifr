// academy.html and the editor's Test as student — "Your turn" on a designed slide (SPEC nesting rules): the runner the academy uses when the build has
// no dedicated one (course/yourTurn.ts, package Q). The slide's instrument becomes a live Try-it stage over the slide
// (same player, same goal tracker, same controls and assist), the goal is checked live, and the result comes back:
// the slide's yourTurnDone reveal fires, checklist rows tick, bound values show, and an AttemptRecord of kind
// 'yourTurn' is stored (practice unless the goal is graded and unassisted).
//
// The hand-over itself is the one of every stage (course/handover.ts): the « À vous » card with the instrument
// frozen, « Prendre les commandes », « Vous avez les commandes », the result. Here: the bar over the slide with the
// one way back (« Reprendre le cours »), the result brought back ON the slide (a line under it, the focus returned to
// the slide's « À vous » button, the last attempt shown again when the student comes back to the slide), and a
// Your turn in the full simulator (where: 'sim') opened through the cockpit bridge like a Fly it.
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
import { hw, hwq } from "../handoverWords";
import { lastFlyHandoff, lastLeftFlight, leftFlightLine, type LeftFlight } from "./flyLeft";
import { GoalTracker, rowsFor, stageView } from "../goals";

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
    // one filled button per screen: « Prendre les commandes » on the card; the way back takes it while the result
    // card shows « Réussi » (course-handover.css reads the stage's data-handover="done")
    const done = h(
      "button",
      { class: "gl-btn sm ga-yt-back", type: "button" },
      hw("backToCourse", c.lang),
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
      handoverWayOn: (l) =>
        l === "fr"
          ? `${hwq("backToCourse", l)}, en haut, vous ramène à la diapositive avec ce résultat.`
          : `${hwq("backToCourse", l)}, at the top, takes you back to the slide with this result.`,
    });
    done.addEventListener("click", () => void finish());
    // Esc: first it hands the controls back (the stage's layer takes the key while the student flies), then it
    // returns to the slide. The focus goes to « Prendre les commandes » (the nested player puts it there).
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") void finish();
    });
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
      if (!(await flySlideYourTurn(c))) o.notify?.(ct("yourTurnSim", c.lang));
      return null;
    }
    return runSlideYourTurn(c, o.root());
  };
  return (ctx) => {
    const el = h("div", { class: "cp-slide" });
    // eslint-disable-next-line prefer-const
    let v: SlideView;
    // the result, brought back on the slide: one line under it, said to screen readers too
    const line = h("p", { class: "sl-yt-result", role: "status", hidden: true });
    let lineFor: { yt: YourTurn; r: YourTurnResult } | null = null;
    let hideT = 0;
    const showResult = (yt: YourTurn, r: YourTurnResult, lang: Lang, pill = true) => {
      lineFor = { yt, r };
      line.textContent = yourTurnResultLine(yt, r, lang);
      line.classList.toggle("ok", r.met);
      // the sentence shows a few seconds (it may cover the slide's footer); the button keeps the result
      window.clearTimeout(hideT);
      line.hidden = !pill;
      if (pill) hideT = window.setTimeout(() => (line.hidden = true), 8000);
      for (const b of el.querySelectorAll<HTMLElement>(".sl-yourturn")) {
        b.dataset.result = r.met ? "ok" : "notyet";
        b.dataset.resultText = r.met
          ? lang === "fr"
            ? "réussi"
            : "done"
          : hw("tryAgain", lang).toLowerCase();
      }
    };
    const apply = (blockId: string, yt: YourTurn, r: YourTurnResult, say: boolean) => {
      results.set(`${ctx.step.id}|${blockId}`, r);
      v.setChecks(r.checks);
      v.fire("yourTurnDone");
      v.update(ctx.step.slide);
      dress();
      showResult(yt, r, ctx.lang, say);
      if (say) ctx.announce(line.textContent ?? "");
    };
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
      onEvent: (w) => ctx.onEvent?.(w),
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
          apply(b.id, yt, r, true);
          // the focus comes back where the student left the slide
          el.querySelector<HTMLElement>(".sl-yourturn")?.focus({ preventScroll: true });
        }),
    });
    el.append(line);
    // the slide's own controls are the way to do the exercise: its button only opens a larger view of it
    const dress = () => enlargeButtons(el, ctx.step, ctx.lang);
    dress();
    // back on this slide later (or back from the cockpit): the last attempt shows again
    const turns = (ctx.step.slide?.blocks ?? []).flatMap((b) =>
      "yourTurn" in b && b.yourTurn ? [{ id: b.id, yt: b.yourTurn }] : [],
    );
    // a flight in the simulator left without a result says so, until it is flown again (audit §45)
    let leftFor: LeftFlight | null = null;
    const showLeft = (f: LeftFlight, lang: Lang) => {
      leftFor = f;
      window.clearTimeout(hideT);
      line.classList.remove("ok");
      line.textContent = leftFlightLine(f, hw("flyInSim", lang), lang);
      line.hidden = false;
      for (const b of el.querySelectorAll<HTMLElement>(".sl-yourturn")) {
        b.dataset.result = "notyet";
        b.dataset.resultText = lang === "fr" ? "vol interrompu" : "stopped";
      }
    };
    const store = o.store;
    if (store && turns.length)
      void Promise.all([
        lastYourTurn(store, ctx.course.id, ctx.step.id, turns),
        turns.some((t) => t.yt.where === "sim") ? leftFlightOf(store, ctx.course.id, ctx.step.id) : null,
      ])
        .then(([last, left]) => {
          if (!el.isConnected || lineFor) return;
          if (left) showLeft(left, ctx.lang);
          else if (last) apply(last.id, last.yt, last.r, false);
        })
        .catch(() => undefined);
    const stopLive = watchLiveGoals({
      el,
      v,
      step: ctx.step,
      lang: ctx.lang,
      turns,
      onRows: (checks) => v.setChecks(checks),
      // stuck for a while: the hint says itself on the slide (the student never had to look for it)
      onStuck: (yt) => {
        if (!yt.hint || lineFor?.r.met) return;
        window.clearTimeout(hideT);
        line.classList.remove("ok");
        line.textContent = stuckLine(yt, ctx.lang);
        line.hidden = false;
        ctx.announce(line.textContent);
      },
      onMet: (blockId, yt, r) => {
        apply(blockId, yt, r, true);
        if (o.store)
          void import("../handoff")
            .then(({ recordYourTurnResult }) =>
              recordYourTurnResult(o.store!, {
                course: ctx.course,
                stepId: ctx.step.id,
                block: blockId,
                profileId: "local",
                result: r,
                graded: yourTurnGraded(yt),
              }),
            )
            .catch(() => null);
      },
    });
    return {
      el,
      next: () => v.next(),
      prev: () => v.prev(),
      setLang: (l) => {
        v.setLang(l);
        if (lineFor) showResult(lineFor.yt, lineFor.r, l, !line.hidden);
        else if (leftFor) showLeft(leftFor, l);
      },
      destroy: () => {
        stopLive();
        v.destroy();
      },
      sims: v.sims,
      relayout: () => v.relayout(),
    };
  };
}

/**
 * The slide's own live instrument is where the student does the exercise: its goal is tracked right there, with the
 * same tracker as the « À vous » runner, from the first touch of a control (a slide that opens already inside the
 * goal never ticks by itself). The rows tick as they are met; once the whole goal is met, onMet gets the result.
 * Returns the stop function.
 */
export function watchLiveGoals(o: {
  el: HTMLElement;
  v: Pick<SlideView, "sims">;
  step: Step;
  lang: Lang;
  turns: { id: string; yt: YourTurn }[];
  onRows(checks: boolean[]): void;
  onMet(blockId: string, yt: YourTurn, r: YourTurnResult): void;
  /** no new row met for `stuckS` seconds since the first touch (or the last row met): once per exercise */
  onStuck?(yt: YourTurn): void;
  stuckS?: number;
  /** test seam: the clock and the timer */
  now?: () => number;
  every?: (fn: () => void, ms: number) => () => void;
}): () => void {
  const blocks = o.step.slide?.blocks ?? [];
  const live = o.turns
    .filter((t) => t.yt.where !== "sim")
    .map((t) => {
      const b = blocks.find((x) => x.id === t.id);
      const scene =
        t.yt.scene ??
        (b && (b.kind === "instrument" || b.kind === "simViewport") ? b.scene : undefined) ??
        o.step.slide?.scene;
      const failures = b && b.kind === "instrument" ? b.failures : undefined;
      return {
        ...t,
        scene,
        failures,
        tracker: new GoalTracker(t.yt.goal, o.lang),
        done: false,
        key: "",
        ticks: 0,
        progressAt: 0,
        stuck: false,
      };
    })
    .filter((t) => typeof t.scene === "string");
  if (!live.length) return () => undefined;
  const now = o.now ?? (() => performance.now());
  let engagedAt: number | null = null;
  const engage = (e: Event) => {
    // the « À vous » button opens the larger view: it is not a touch of the slide's controls
    if ((e.target as Element | null)?.closest?.(".sl-yourturn")) return;
    if (engagedAt === null) {
      engagedAt = now();
      for (const x of live) x.progressAt = engagedAt;
    }
  };
  o.el.addEventListener("pointerdown", engage, true);
  o.el.addEventListener("keydown", engage, true);
  let last = now();
  const tick = () => {
    const t = now();
    const dt = Math.min(1, (t - last) / 1000);
    last = t;
    if (engagedAt === null || !o.el.isConnected) return;
    for (const x of live) {
      if (x.done) continue;
      const sim = o.v.sims.get(x.scene as string, x.failures)?.sim;
      if (!sim) continue;
      const st = x.tracker.update(stageView(sim), dt);
      const checks = st.rows.filter((r) => r.check >= 0).map((r) => r.ticked);
      const key = checks.join();
      if (key !== x.key) {
        x.key = key;
        o.onRows(checks);
      }
      const n = st.rows.filter((r) => r.ticked).length;
      if (n > x.ticks) {
        x.ticks = n;
        x.progressAt = t;
      }
      if (!st.met && !x.stuck && t - x.progressAt >= (o.stuckS ?? 20) * 1000) {
        x.stuck = true;
        o.onStuck?.(x.yt);
      }
      if (st.met) {
        x.done = true;
        o.onMet(x.id, x.yt, { met: true, checks: checks.map(() => true), secs: (t - engagedAt) / 1000 });
      }
    }
  };
  const stop = o.every
    ? o.every(tick, 250)
    : (() => {
        const id = window.setInterval(tick, 250);
        return () => window.clearInterval(id);
      })();
  return () => {
    stop();
    o.el.removeEventListener("pointerdown", engage, true);
    o.el.removeEventListener("keydown", engage, true);
  };
}

/** The ids of the slide's exercises the student does on the slide itself: a live instrument with its own controls. Pure. */
export function onSlideTurnIds(step: Step): string[] {
  return (step.slide?.blocks ?? []).flatMap((b) =>
    b.kind === "instrument" &&
    "yourTurn" in b &&
    b.yourTurn &&
    b.yourTurn.where !== "sim" &&
    (b.yourTurn.controls ?? b.controls ?? []).length > 0
      ? [b.id]
      : [],
  );
}

/** The words of the slide's secondary button when the exercise is done on the slide (FR / EN). */
export const enlargeWords = (lang: Lang): { label: string; aria: string } =>
  lang === "fr"
    ? { label: "Agrandir", aria: "Agrandir l’exercice : même objectif, en plus grand" }
    : { label: "Enlarge", aria: "Enlarge the exercise: same goal, larger" };

/**
 * An exercise done on the slide: its « À vous » button is no longer a pill on the instrument face. It becomes a
 * secondary « Agrandir » just above the instrument (outside it), since the controls under the instrument are the way
 * to do it. A button the renderer made again (after an update) is dressed again.
 */
function enlargeButtons(el: HTMLElement, step: Step, lang: Lang) {
  const ids = new Set(onSlideTurnIds(step));
  if (!ids.size) return;
  const w = enlargeWords(lang);
  for (const b of el.querySelectorAll<HTMLButtonElement>(".sl-hud-btn.sl-yourturn:not(.is-sim)")) {
    if (!ids.has(b.dataset.block ?? "")) continue;
    b.classList.add("is-enlarge");
    // above the block's top-right corner (the renderer reads these when it places its buttons)
    b.dataset.at = "1,0";
    b.dataset.origin = "1,1";
    const text = b.querySelector<HTMLElement>("span:not(.sl-hud-ic)");
    if (text) text.textContent = w.label;
    b.setAttribute("aria-label", w.aria);
    b.title = w.aria;
  }
}

/** The hint, said on the slide when the student is stuck. Pure. */
export function stuckLine(yt: YourTurn, lang: Lang): string {
  const hint = yt.hint ? loc(yt.hint, lang) : "";
  return lang === "fr" ? `Un indice : ${hint}` : `A hint: ${hint}`;
}

// ------------------------------------------------------------------ hand-over: the result on the slide
/** The result of a Your turn in one plain sentence, with the reason when it is not met yet. Pure. */
export function yourTurnResultLine(yt: YourTurn, r: YourTurnResult, lang: Lang): string {
  const fr = lang === "fr";
  const k = hw("yourTurn", lang);
  const secs = Math.max(1, Math.round(r.secs));
  if (r.met) return fr ? `${k} : réussi en ${secs} s.` : `${k}: done in ${secs} s.`;
  const rows = rowsFor(yt.goal.all, lang).filter((x) => x.check >= 0);
  const missing = rows.filter((x) => !r.checks[x.check]).map((x) => x.text.replace(/\*\*/g, ""));
  const again = fr
    ? `${hwq("yourTurn", lang)} pour réessayer.`
    : `${hwq("yourTurn", lang)} to try again.`;
  if (!missing.length) return fr ? `${k} : pas encore. ${again}` : `${k}: not yet. ${again}`;
  const what = missing.slice(0, 2).join(fr ? " ; " : "; ") + (missing.length > 2 ? "…" : "");
  return fr
    ? `${k} : pas encore. Il manque : ${what}. ${again}`
    : `${k}: not yet. Still missing: ${what}. ${again}`;
}

/** The step's last flight in the simulator, when it was left without a result (audit §45). */
async function leftFlightOf(store: CourseStore, courseId: string, stepId: string): Promise<LeftFlight | null> {
  const [attempts, handoffs] = await Promise.all([store.listAttempts({ courseId, stepId }), store.listHandoffs()]);
  return lastLeftFlight(lastFlyHandoff(handoffs, courseId, stepId), attempts);
}

/** The student's last attempt at one of the slide's Your turns (on the slide, or flown in the simulator). */
async function lastYourTurn(
  store: CourseStore,
  courseId: string,
  stepId: string,
  turns: { id: string; yt: YourTurn }[],
): Promise<{ id: string; yt: YourTurn; r: YourTurnResult } | null> {
  const list = (await store.listAttempts({ courseId, stepId })).sort((a, b) => a.at.localeCompare(b.at));
  for (const a of list.reverse()) {
    if (a.kind === "yourTurn" && a.yourTurn) {
      const t = turns.find((x) => x.id === a.yourTurn!.block);
      if (t) return { ...t, r: a.yourTurn.result };
    }
    // a Your turn flown in the cockpit comes back as a flown attempt of this step
    const sim = turns.find((x) => x.yt.where === "sim");
    if (a.kind === "fly" && a.fly && !a.fly.ungraded && sim)
      return {
        ...sim,
        r: {
          met: a.fly.passed,
          checks: sim.yt.goal.all.map((_, i) => a.fly!.criteria[i]?.met ?? a.fly!.passed),
          secs: a.secs,
          token: a.fly.token,
        },
      };
  }
  return null;
}

/**
 * A Your turn in the full simulator: the handoff of a Fly it (the block's scene, its goal as criteria), then the
 * cockpit, whose « À vous » card and course strip bring the student back to this slide. False when it cannot be
 * flown from here (no store, no cockpit bridge, no scene): the caller says so.
 */
export async function flySlideYourTurn(
  c: YourTurnCtx,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): Promise<boolean> {
  const b = c.block;
  const scene =
    c.yt.scene ??
    (b.kind === "instrument" || b.kind === "simViewport" ? b.scene : undefined) ??
    c.step.slide?.scene;
  if (!c.store || typeof scene !== "string") return false;
  try {
    const { cockpitBridgeReady, noteFly } = await import("../cockpitLink");
    if (!cockpitBridgeReady()) return false;
    const { createHandoff, flyUrl, courseReturnUrl } = await import("../handoff");
    const hd = await createHandoff(c.store, {
      course: c.course,
      step: c.step,
      yourTurn: { block: b.id, yourTurn: c.yt, sceneId: scene },
    });
    noteFly({ token: hd.token, course: loc(c.course.title, c.lang), step: loc(c.step.title, c.lang), back: courseReturnUrl(c.course.id, c.step.id) });
    navigate(flyUrl(hd.token));
    return true;
  } catch {
    return false;
  }
}
