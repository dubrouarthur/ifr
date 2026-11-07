// The cockpit side of courses (package J, SPEC §3.2, §6.2, §9.3): everything index.html needs to fly a course step
// and to capture scenes for the editor, behind one small host interface, so main.ts only has to wire a few calls.
//
//   ?fly=<token>              fly a course step (Fly it, or a Your turn in the simulator); "Back to the course" after
//   ?scene=S1.<code>          pose a shared scene
//   ?capture=<courseId>&return=<editor URL>   capture mode: C = scene, Shift+C = the last 60 s, back to the editor
//
// Until main.ts calls installCourseBridge(), cockpitBridgeReady() is false and the course player says so on the
// Fly-it card (and offers the existing ?lesson= / ?scenario= deep link when the target is a lesson or a scenario).
import type { Exercise } from "../train/engine";
import type { Sim } from "../sim/sim";
import type {
  Clip,
  Cockpit,
  Course,
  FlyOption,
  Handoff,
  Lang,
  SimScene,
  Step,
  World,
} from "./types";
import { courseStore, type CourseStore, type TrayItem } from "./store";
import { markCockpitBridge } from "./cockpitLink";
import {
  consumeHandoff,
  courseReturnUrl,
  isSafeReturnUrl,
  recordFlyResult,
  resolveHandoff,
  TOKEN_RE,
} from "./handoff";
import { flyItPlan, type CourseExercise, type FlyPlan } from "./toExercise";
import {
  applyScene,
  captureScene,
  decodeScene,
  describeNotCaptured,
  validateScene,
  verifyLine,
} from "./scene";
import { RewindRing } from "./rewind";
import { ClipRecorder } from "./clip";
import { generate } from "./calc";

export { BRIDGE_KEY, BRIDGE_VERSION, cockpitBridgeReady, legacyFlyLink, markCockpitBridge } from "./cockpitLink";

export interface CourseLinkParams {
  fly?: string;
  scene?: string;
  capture?: string;
  ret?: string;
  /** ?proc=<id>: a course's procedure block "Drill it" */
  proc?: string;
}
/** Read ?fly=, ?scene=, ?capture= and &return= (bad values are dropped). */
export function courseLinkParams(search: string): CourseLinkParams {
  const q = new URLSearchParams(search);
  const out: CourseLinkParams = {};
  const fly = q.get("fly");
  if (fly && TOKEN_RE.test(fly)) out.fly = fly;
  const sc = q.get("scene");
  if (sc && /^S[01]\.[A-Za-z0-9_-]+$/.test(sc)) out.scene = sc;
  const cap = q.get("capture");
  if (cap !== null && /^[A-Za-z0-9._-]{0,80}$/.test(cap)) out.capture = cap;
  const proc = q.get("proc");
  if (proc && /^[A-Za-z0-9._-]{1,80}$/.test(proc)) out.proc = proc;
  const ret = q.get("return");
  if (
    ret &&
    isSafeReturnUrl(
      ret,
      typeof location === "undefined" ? undefined : location.origin,
    )
  )
    out.ret = ret;
  return out;
}

/** What main.ts gives the bridge (every call is something main.ts already does today). */
export interface CockpitHost {
  sim: Sim;
  lang(): Lang;
  cockpit(): Cockpit;
  world?(): World;
  airac?(): string;
  toast(
    text: string,
    kind?: "info" | "good" | "warn" | "bad",
    ms?: number,
  ): void;
  /** run a compiled exercise now (main.ts startExerciseNow) */
  runExercise(ex: Exercise): void;
  /** open a lesson's briefing (main.ts pickExercise(exercise(id), path)) */
  startLesson(exerciseId: string, pathId?: string): void;
  /** start a scenario (main.ts startScenario) */
  startScenario(scenarioId: string, wx?: string): void;
  /** start a procedure drill (procedures mode) */
  startProcedure?(procId: string): void;
  /** panel thumbnail 320×240 for the tray (optional) */
  panelThumb?(): Promise<Blob | null>;
  /** 3D still 480×270 for the tray (optional) */
  outsideStill?(): Promise<Blob | null>;
  /** the brief card while the flight loads (optional: the default is a toast) */
  showBrief?(h: Handoff, step: Step, course: Course): void;
}

export interface FlyOutcome {
  passed: boolean;
  durationSec: number;
  selfGrade?: "nailed" | "close" | "notyet";
  historyId?: string;
  procResults?: unknown[];
  profileId?: string;
}

const T = {
  flyMissing: [
    "This course flight link has expired or was opened on another device. Open the course again and press Fly it.",
    "Ce lien de vol a expiré ou a été ouvert sur un autre appareil. Rouvrez le cours et appuyez sur « À vous ».",
  ],
  flyConsumed: [
    "This course flight was already started. Starting it again.",
    "Ce vol de cours a déjà été lancé. Il redémarre.",
  ],
  courseChanged: [
    "The course changed since you pressed Fly it: flying the version you opened.",
    "Le cours a changé depuis « À vous » : vous volez la version ouverte.",
  ],
  flyStart: ["Course flight: {t}", "Vol du cours : {t}"],
  sceneBad: [
    "This scene link cannot be used: {r}",
    "Ce lien de scène est inutilisable : {r}",
  ],
  sceneOk: ["Scene loaded", "Scène chargée"],
  captured: ["Captured for the course: {t}", "Capturé pour le cours : {t}"],
  clipped: [
    "Captured the last {n} s for the course",
    "Les {n} dernières s capturées pour le cours",
  ],
  noClip: [
    "Nothing to clip yet: fly a little first",
    "Rien à découper encore : volez un peu d’abord",
  ],
  noStore: [
    "Captures need this device's storage (it is off in this window)",
    "Les captures demandent le stockage de l’appareil (désactivé dans cette fenêtre)",
  ],
} as const;
const tx = (
  k: keyof typeof T,
  lang: Lang,
  vars: Record<string, string | number> = {},
) =>
  T[k][lang === "fr" ? 1 : 0].replace(/\{(\w+)\}/g, (_, v: string) =>
    String(vars[v] ?? ""),
  );

/**
 * The bridge. main.ts: `const bridge = await installCourseBridge(host)` once at boot, `bridge.tick()` every frame,
 * `bridge.capture()` on C, `bridge.captureClip()` on Shift+C, and `await bridge.finish(outcome)` from the result
 * modal's "Back to the course" (then `location.href = url` when it returns one).
 */
export class CourseBridge {
  readonly params: CourseLinkParams;
  readonly ring: RewindRing;
  /** the course flight in progress (?fly=) */
  handoff: Handoff | null = null;
  course: Course | null = null;
  step: Step | null = null;
  plan: FlyPlan | null = null;
  exercise: CourseExercise | null = null;
  private store: CourseStore | null;
  private started = 0;

  constructor(
    private host: CockpitHost,
    store: CourseStore | null,
    search: string,
  ) {
    this.store = store;
    this.params = courseLinkParams(search);
    this.ring = new RewindRing({
      capture: () => ({
        cockpit: host.cockpit(),
        ...(host.world ? { world: host.world() } : {}),
      }),
    });
  }
  get capturing(): boolean {
    return this.params.capture !== undefined;
  }
  /** the editor URL to go back to in capture mode */
  get captureReturn(): string | null {
    return this.params.ret ?? null;
  }
  /** call every frame (the 1 Hz rewind ring that Shift+C clips from) */
  tick(): void {
    this.ring.tick(this.host.sim);
  }

  /** ?fly=<token>: resolve, brief, pose and start. Returns false when there is nothing to fly. */
  async startFlight(token = this.params.fly): Promise<boolean> {
    const lang = this.host.lang();
    if (!token) return false;
    const store = this.store;
    if (!store) {
      this.host.toast(tx("flyMissing", lang), "warn", 9000);
      return false;
    }
    const r = await resolveHandoff(store, token, new Date(), async (id) => {
      // the shipped samples are not stored: the cockpit rebuilds them (a lazy chunk)
      const m = await import("./samples");
      return m.isSampleId(id) ? m.sampleCourse(id) : null;
    });
    if (
      !r.handoff ||
      !r.course ||
      !r.step ||
      r.state === "missing" ||
      r.state === "expired"
    ) {
      this.host.toast(tx("flyMissing", lang), "warn", 9000);
      return false;
    }
    if (r.state === "consumed")
      this.host.toast(tx("flyConsumed", lang), "info");
    if (r.courseChanged) this.host.toast(tx("courseChanged", lang), "info");
    this.handoff = r.handoff;
    this.course = r.course;
    this.step = r.step;
    const calcProblem = r.handoff.calc
      ? generate(
          r.handoff.calc.generatorId,
          r.handoff.calc.seed,
          r.handoff.calc.params,
        )
      : undefined;
    const options: FlyOption[] = r.handoff.options ?? [];
    this.plan = flyItPlan(r.step, r.course, {
      applyScene: (sim, scene) => applyScene(sim, scene),
      options,
      lang,
      ...(calcProblem ? { calcProblem } : {}),
    });
    if (this.host.showBrief) this.host.showBrief(r.handoff, r.step, r.course);
    else {
      const t = r.step.title;
      this.host.toast(
        tx("flyStart", lang, { t: (lang === "fr" ? t.fr : undefined) ?? t.en }),
        "info",
        6000,
      );
    }
    const p = this.plan;
    switch (p.kind) {
      case "exercise":
        this.exercise = "criteria" in p.exercise ? (p.exercise as CourseExercise) : null;
        this.host.runExercise(p.exercise);
        break;
      case "lesson":
        this.host.startLesson(p.exerciseId, p.pathId);
        break;
      case "scenario":
        this.host.startScenario(p.scenarioId, p.wx);
        break;
      case "procedure":
        this.host.startProcedure?.(p.procId);
        break;
    }
    this.started = Date.now();
    await consumeHandoff(store, token).catch(() => null);
    return true;
  }

  /** "Back to the course": record the attempt, then the URL to open (null when there is no course flight). */
  async finish(o: FlyOutcome): Promise<string | null> {
    const h = this.handoff;
    if (!h) return null;
    if (this.store) {
      await recordFlyResult(this.store, h.token, {
        profileId: o.profileId ?? "local",
        passed: o.passed,
        selfGrade: o.selfGrade ?? (o.passed ? "nailed" : "notyet"),
        criteria: this.exercise?.criteria?.() ?? [],
        secs: o.durationSec || (Date.now() - this.started) / 1000,
        ...(o.historyId ? { historyId: o.historyId } : {}),
        ...(o.procResults ? { procResults: o.procResults } : {}),
      }).catch(() => null);
    }
    return this.returnUrl();
  }
  /** the course page to go back to (checked against this site) */
  returnUrl(): string | null {
    const h = this.handoff;
    if (!h) return null;
    const origin =
      typeof location === "undefined" ? undefined : location.origin;
    const url = h.returnUrl || courseReturnUrl(h.courseId, h.stepId, h.token);
    return isSafeReturnUrl(url, origin)
      ? url
      : courseReturnUrl(h.courseId, h.stepId, h.token);
  }
  /** the history record tag (SPEC §9.8) */
  historyTag(): {
    id: string;
    rev: number;
    stepId: string;
    token: string;
  } | null {
    const h = this.handoff;
    if (!h) return null;
    return {
      id: h.courseId,
      rev: h.rev,
      stepId: h.stepId,
      token: h.token,
    };
  }

  /** ?scene=: decode, validate and pose. Returns the problems to show (empty = posed as captured). */
  async openScene(code = this.params.scene): Promise<string[]> {
    if (!code) return [];
    const lang = this.host.lang();
    let sc: SimScene;
    try {
      sc = await decodeScene(code);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      this.host.toast(tx("sceneBad", lang, { r: why }), "bad", 9000);
      return [why];
    }
    const v = validateScene(sc, {
      ...(this.host.airac ? { airac: this.host.airac() } : {}),
    });
    const errs = v.issues
      .filter((i) => i.level === "error")
      .map((i) => (lang === "fr" ? (i.text.fr ?? i.text.en) : i.text.en));
    if (!v.ok) {
      this.host.toast(tx("sceneBad", lang, { r: errs[0] ?? "" }), "bad", 9000);
      return errs;
    }
    const diffs = applyScene(this.host.sim, sc);
    const line = verifyLine(this.host.sim, sc, diffs, lang);
    this.host.toast(
      diffs.length ? line.text : tx("sceneOk", lang),
      diffs.length ? "warn" : "good",
      6000,
    );
    return diffs.map((d) =>
      lang === "fr" ? (d.text.fr ?? d.text.en) : d.text.en,
    );
  }

  /** C: capture the current scene into the editor's tray. */
  async capture(label?: string): Promise<TrayItem | null> {
    return this.addToTray(
      captureScene(this.host.sim, this.captureOpts()),
      undefined,
      label,
    );
  }
  /** Shift+C: the last 60 s as a clip (with its start scene). */
  async captureClip(seconds = 60, label?: string): Promise<TrayItem | null> {
    const lang = this.host.lang();
    const r = ClipRecorder.lastSeconds(this.ring, this.host.sim.rec, seconds, {
      capture: this.captureOpts(),
    });
    if (!r) {
      this.host.toast(tx("noClip", lang), "warn");
      return null;
    }
    return this.addToTray(r.scene, r.clip, label, seconds);
  }
  private captureOpts() {
    return {
      cockpit: this.host.cockpit(),
      ...(this.host.world ? { world: this.host.world() } : {}),
      ...(this.host.airac ? { airac: this.host.airac() } : {}),
      from: "cockpit" as const,
    };
  }
  private async addToTray(
    scene: SimScene,
    clip: Clip | undefined,
    label?: string,
    secs?: number,
  ): Promise<TrayItem | null> {
    const lang = this.host.lang();
    const store = this.store;
    if (!store) {
      this.host.toast(tx("noStore", lang), "warn");
      return null;
    }
    let thumb: string | undefined;
    let still: string | undefined;
    try {
      const tb = await this.host.panelThumb?.();
      if (tb)
        thumb = (await store.putAsset(tb, { w: 320, h: 240, role: "thumb" }))
          .id;
      const sb = await this.host.outsideStill?.();
      if (sb)
        still = (await store.putAsset(sb, { w: 480, h: 270, role: "still" }))
          .id;
    } catch {
      /* the capture still goes in without pictures */
    }
    const name = label ?? scene.label ?? "";
    const item = await store.addTray({
      scene,
      ...(clip ? { clip } : {}),
      ...(this.params.capture ? { courseId: this.params.capture } : {}),
      ...(thumb ? { thumb } : {}),
      ...(still ? { still } : {}),
      ...(name ? { label: name } : {}),
    });
    const missing = scene.notCaptured?.length
      ? ` (${scene.notCaptured.map((x) => describeNotCaptured(x, lang)).join("; ")})`
      : "";
    this.host.toast(
      (clip
        ? tx("clipped", lang, { n: secs ?? 60 })
        : tx("captured", lang, { t: name || "scene" })) + missing,
      "good",
      5000,
    );
    return item;
  }
}

/**
 * main.ts, once at boot: opens the course store, marks the bridge as installed (the player then offers Fly it),
 * and handles ?fly= and ?scene= at once. Never rejects.
 */
export async function installCourseBridge(
  host: CockpitHost,
  opts: { search?: string; store?: CourseStore | null } = {},
): Promise<CourseBridge> {
  const search =
    opts.search ?? (typeof location === "undefined" ? "" : location.search);
  let store: CourseStore | null = opts.store ?? null;
  if (opts.store === undefined) store = await courseStore().catch(() => null);
  const b = new CourseBridge(host, store, search);
  markCockpitBridge();
  try {
    if (b.params.fly) await b.startFlight();
    else if (b.params.scene) await b.openScene();
    else if (b.params.proc) host.startProcedure?.(b.params.proc);
  } catch (e) {
    host.toast(String(e instanceof Error ? e.message : e), "bad", 9000);
  }
  return b;
}
