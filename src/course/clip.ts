// Ground school clips (SPEC §9.2, R3): record a stretch of flight, play it back on any Sim, take over at any point.
//
//   ClipRecorder  cuts a Clip out of a Sim's recorder (2 Hz samples, 1 Hz exact keyframes, the event track) and the
//                 rewind ring (the start scene): ClipRecorder.fromRing(ring, rec, fromT, toT), Shift+C = the last
//                 60 s, or begin()/stop() around a demo flown on a stage Sim.
//   ClipPlayer    the debrief replay of main.ts, extracted: interpolates the 2 Hz samples, applies the 1 Hz keys and
//                 the events (radios, autopilot modes, plan sequencing, failures), re-derives TRK / GS / turn rate and
//                 calls updateAvionics(0). Cues fire (and pause) as the clip plays. takeOver(t) hands the aircraft to
//                 the student from the keyframe at or before t: the exact state, no velocity jump.
//                 ClipPlayer.fromRecorder(sim) is the cockpit's debrief replay (same Sim, restored exactly on end()).
//
// Every time in a Clip is seconds from the clip start (keys, events, samples, cues, and the chronometer's
// `timerStart`). The player runs the Sim's clock on that time, so the chronometer reads right.
import type { Avionics, Sim } from "../sim/sim";
import { AIRFRAME, engineTorque, propCoefficients } from "../sim/aircraft";
import { density, FT, KT, pressureAltitude } from "../sim/environment";
import {
  cloneAvionics,
  type ApSnapshot,
  type FlightEvent,
  type PlanSnapshot,
  type Recorder,
  type RecKey,
  type RecTrackEvent,
  type Sample,
} from "../sim/recorder";
import type { LatMode, VertMode } from "../avionics/autopilot";
import { wrap180, DEG } from "../nav/geo";
import type { Clip, L10n, Lang, SimScene } from "./types";
import {
  applyApModes,
  applyScene,
  captureScene,
  newSceneId,
  rederive,
  tasForIas,
  type CaptureOptions,
  type SceneAp,
  type ScenePlan,
} from "./scene";
import type { RewindRing } from "./rewind";

export type ClipKey = Clip["keys"][number];
export type ClipEvent = Clip["events"][number];
export type ClipCue = Clip["cues"][number];

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ---------------------------------------------------------------- exact save / restore of a live Sim
const INST = Symbol("instance");
const DATA = Symbol("data");
interface Memento {
  [INST]: object;
  props: Record<string, unknown>;
}
/** plain data: the live object (restored in place) and its deep copy */
interface DataMemo {
  [DATA]: object;
  copy: unknown;
}
const isPlain = (v: object) => {
  const p = Object.getPrototypeOf(v) as unknown;
  return p === Object.prototype || p === null || Array.isArray(v);
};
function cloneData<T>(v: T): T {
  try {
    return structuredClone(v);
  } catch {
    return v; // holds a function or a class instance: kept by reference
  }
}
/** a copy of an object's own state: plain data deep-copied, class instances (autopilot, plan, aircraft, wind
 *  model, systems, random stream) recursed into, functions kept */
function memento(o: object, depth: number, skip: readonly string[] = []): Memento {
  const props: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    if (skip.includes(k)) continue;
    const v = (o as Record<string, unknown>)[k];
    if (v === null || typeof v !== "object") props[k] = v;
    else if (!isPlain(v)) props[k] = depth > 0 ? memento(v, depth - 1) : v;
    else props[k] = { [DATA]: v, copy: cloneData(v) } satisfies DataMemo;
  }
  return { [INST]: o, props };
}
/** write plain data back in place (an object other code holds a reference to keeps its identity) */
function assignInPlace(target: Record<string, unknown> | unknown[], src: unknown): void {
  if (Array.isArray(target) && Array.isArray(src)) {
    target.length = 0;
    target.push(...(src as unknown[]));
    return;
  }
  const t = target as Record<string, unknown>;
  const s = src as Record<string, unknown>;
  for (const k of Object.keys(t)) if (!(k in s)) delete t[k];
  for (const [k, v] of Object.entries(s)) {
    const cur = t[k];
    if (cur && v && typeof cur === "object" && typeof v === "object" && isPlain(cur) && isPlain(v) && Array.isArray(cur) === Array.isArray(v))
      assignInPlace(cur as Record<string, unknown>, v);
    else t[k] = v;
  }
}
function restoreMemento(m: Memento): void {
  const o = m[INST] as Record<string, unknown>;
  for (const [k, v] of Object.entries(m.props)) {
    if (v && typeof v === "object" && DATA in v) {
      const d = v as DataMemo;
      const live = o[k];
      // the same object still there: written back in place (other code may hold it); replaced: the copy goes back
      if (live === d[DATA]) assignInPlace(live as Record<string, unknown>, d.copy);
      else o[k] = d.copy;
    } else if (v && typeof v === "object" && INST in v) {
      const sub = v as Memento;
      restoreMemento(sub);
      o[k] = sub[INST];
    } else o[k] = v;
  }
}
/** the whole live state of a Sim except its flight record (aircraft with its filters and wind model, avionics,
 *  autopilot, plan, systems, failures, clock, random stream) */
export function saveSim(sim: Sim): () => void {
  const m = memento(sim, 3, ["rec", "scenario"]);
  return () => restoreMemento(m);
}

// ---------------------------------------------------------------- engine: the throttle that holds an RPM
/** the throttle at which the engine holds `rpm` at the current airspeed (torque balance with the propeller): the
 *  take-over leaves the RPM where it was instead of jumping to the start scene's throttle */
export function throttleForRpm(sim: Sim, rpm = sim.ac.s.rpm): number {
  const s = sim.ac.s;
  const drv = sim.ac.drive;
  if (drv && !drv.combustion) return sim.controls.throttle;
  const w = sim.weather;
  const rho = density(pressureAltitude(s.altFt, w.qnh), w.oatSeaLevelC);
  const sigma = rho / 1.225;
  const n = Math.max(1, rpm / 60);
  const D = AIRFRAME.propDiam;
  const J = Math.max(1, s.tas) / (n * D);
  const qProp = (propCoefficients(J).cp * rho * n * n * D ** 5) / (2 * Math.PI);
  const pf = drv?.powerFactor ?? 1;
  const q = (thr: number) => engineTorque(rpm, thr, sigma, true, pf);
  if (q(1) <= qProp) return 1;
  if (q(0) >= qProp) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (q(mid) < qProp) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- cutting clips
function rebaseAv(av: Avionics, dt: number): Avionics {
  const a = cloneAvionics(av);
  if (a.timerStart !== null) a.timerStart -= dt;
  return a;
}

/** the recorder's keys in [t0, t1] (plus the one just before t0), on the clip clock */
export function keysSlice(
  keys: readonly RecKey[],
  t0: number,
  t1: number,
): ClipKey[] {
  const out: ClipKey[] = [];
  let before: RecKey | null = null;
  for (const k of keys) {
    if (k.t < t0 - 1e-6) before = k;
    else if (k.t <= t1 + 1e-6)
      out.push({ t: k.t - t0, ac: { ...k.ac }, av: rebaseAv(k.av, t0) });
  }
  if (before && (!out.length || out[0].t > 1e-6))
    out.unshift({
      t: before.t - t0,
      ac: { ...before.ac },
      av: rebaseAv(before.av, t0),
    });
  return out;
}

/** the recorder's event track in [t0, t1] on the clip clock, opened by the autopilot, plan and failure state at t0 */
export function trackSlice(
  track: readonly RecTrackEvent[],
  t0: number,
  t1: number,
): ClipEvent[] {
  let ap: RecTrackEvent | null = null;
  let plan: RecTrackEvent | null = null;
  const failures: Record<string, boolean> = {};
  let sawFailure = false;
  const out: ClipEvent[] = [];
  for (const e of track) {
    if (e.t <= t0 + 1e-6) {
      if (e.k === "ap") ap = e;
      else if (e.k === "plan") plan = e;
      else if (e.k === "failure") {
        Object.assign(failures, e.patch as Record<string, boolean>);
        sawFailure = true;
      }
      continue;
    }
    if (e.t > t1 + 1e-6) break;
    let patch = e.patch;
    if (e.k === "av") {
      const p = { ...(patch as Partial<Avionics>) };
      if (typeof p.timerStart === "number") p.timerStart -= t0;
      patch = p;
    }
    out.push({ t: e.t - t0, k: e.k, patch: cloneData(patch) });
  }
  const head: ClipEvent[] = [];
  if (ap) head.push({ t: 0, k: "ap", patch: cloneData(ap.patch) });
  if (plan) head.push({ t: 0, k: "plan", patch: cloneData(plan.patch) });
  if (sawFailure) head.push({ t: 0, k: "failure", patch: failures });
  return [...head, ...out];
}

export function samplesSlice(
  samples: readonly Sample[],
  t0: number,
  t1: number,
): Sample[] {
  const out: Sample[] = [];
  for (const s of samples)
    if (s.t >= t0 - 1e-6 && s.t <= t1 + 1e-6) out.push({ ...s, t: s.t - t0 });
  return out;
}

export interface ClipOptions {
  id?: string;
  /** id of the start scene made by fromRing / stop() (default a new id) */
  sceneId?: string;
  source?: Clip["source"];
  author?: string;
  cues?: ClipCue[];
  /** what the start scene says about the cockpit (cockpit type, world, label) */
  capture?: CaptureOptions;
}

/** one Clip from a recorder between two sim times, starting at `scene` (captured at t0) */
function clipFromRecorder(
  rec: Recorder,
  scene: SimScene,
  t0: number,
  t1: number,
  o: ClipOptions,
): Clip {
  return {
    id: o.id ?? newSceneId("clip"),
    startScene: scene.id,
    durS: Math.max(0, t1 - t0),
    samples: samplesSlice(rec.samples, t0, t1),
    keys: keysSlice(rec.keys, t0, t1),
    events: trackSlice(rec.track, t0, t1),
    cues: (o.cues ?? []).map((c) => ({ ...c })),
    source: o.source ?? "recorded",
    ...(o.author ? { author: o.author } : {}),
  };
}

/** the scene's autopilot / plan / failures as the clip's opening events (when the recorder has no track) */
function sceneHead(scene: SimScene): ClipEvent[] {
  const out: ClipEvent[] = [];
  if (scene.ap)
    out.push({
      t: 0,
      k: "ap",
      patch: { ...scene.ap, armed: [...(scene.ap.armed ?? [])] },
    });
  if (scene.plan) out.push({ t: 0, k: "plan", patch: cloneData(scene.plan) });
  out.push({ t: 0, k: "failure", patch: { ...(scene.failures ?? {}) } });
  return out;
}

export class ClipRecorder {
  private constructor(
    readonly sim: Sim,
    readonly scene: SimScene,
    readonly t0: number,
    private readonly opts: ClipOptions,
  ) {}

  /** Start recording a clip on a Sim from now (a demo flown on a stage Sim, an autoflown worked example). The Sim's
   *  own recorder does the recording; stop() cuts the clip. */
  static begin(sim: Sim, opts: ClipOptions = {}): ClipRecorder {
    sim.rec.resync(sim); // a keyframe and a track baseline exactly at the start
    const scene = captureScene(sim, {
      from: "cockpit",
      ...(opts.capture ?? {}),
      id: opts.sceneId ?? newSceneId(),
    });
    return new ClipRecorder(sim, scene, sim.time, opts);
  }

  get elapsedS(): number {
    return this.sim.time - this.t0;
  }

  stop(): { clip: Clip; scene: SimScene } {
    const rec = this.sim.rec;
    // a final keyframe at the stop time (take over at the very end)
    if (!rec.keys.length || rec.keys[rec.keys.length - 1].t < this.sim.time)
      rec.keys.push({
        t: this.sim.time,
        ac: { ...this.sim.ac.s },
        av: cloneAvionics(this.sim.av),
      });
    return {
      clip: clipFromRecorder(
        rec,
        this.scene,
        this.t0,
        this.sim.time,
        this.opts,
      ),
      scene: this.scene,
    };
  }

  /** a clip between two sim times of a recorder, starting at `scene` (which must show the sim at t0) */
  static fromRecorder(
    rec: Recorder,
    scene: SimScene,
    t0: number,
    t1: number,
    opts: ClipOptions = {},
  ): Clip {
    return clipFromRecorder(rec, scene, t0, t1, opts);
  }

  /**
   * A clip of the cockpit's recent flight: the start scene is the ring frame at or before fromT (the clip starts
   * there), samples come from the recorder, keyframes and events from the recorder when it has them for the whole
   * stretch, else from the ring (1 s resolution). Null when the ring is empty.
   */
  static fromRing(
    ring: RewindRing,
    rec: Recorder,
    fromT: number,
    toT: number,
    opts: ClipOptions = {},
  ): { clip: Clip; scene: SimScene } | null {
    const f = ring.at(fromT);
    if (!f) return null;
    const t0 = f.t;
    const t1 = Math.max(t0, toT);
    const scene: SimScene = {
      ...cloneData(f.scene),
      id: opts.sceneId ?? newSceneId(),
      captured: {
        ...(f.scene.captured ?? { at: new Date().toISOString() }),
        from: "rewind",
      },
    };
    if (opts.capture?.label) scene.label = opts.capture.label;
    const clip = clipFromRecorder(rec, scene, t0, t1, opts);
    const recCovers =
      rec.keys.length > 0 &&
      rec.keys[0].t <= t0 + 1.01 &&
      rec.track.length > 0 &&
      rec.track[0].t <= t0 + 1e-6;
    if (!recCovers) {
      clip.keys = ring.range(t0, t1).map((fr) => {
        const p = fr.scene.pose;
        if (p.kind !== "exact") throw new Error("rewind frames are exact");
        const av = cloneAvionics(p.av);
        if (av.timerStart !== null) av.timerStart += fr.t - t0;
        return { t: fr.t - t0, ac: { ...p.ac }, av };
      });
      clip.events = [
        ...sceneHead(f.scene),
        ...ring.events(t0, t1).map((e) => ({ ...e, t: e.t - t0 })),
      ];
    }
    return { clip, scene };
  }

  /** Shift+C: the last `seconds` of the cockpit's flight */
  static lastSeconds(
    ring: RewindRing,
    rec: Recorder,
    seconds = 60,
    opts: ClipOptions = {},
  ): { clip: Clip; scene: SimScene } | null {
    const n = ring.newest;
    if (!n) return null;
    const end = Math.max(n.t, rec.samples[rec.samples.length - 1]?.t ?? n.t);
    return ClipRecorder.fromRing(ring, rec, end - seconds, end, opts);
  }
}

/** a shorter clip (the editor's trim): the start scene moves to the keyframe at or before fromT */
export function trimClip(
  clip: Clip,
  scene: SimScene,
  fromT: number,
  toT: number,
): { clip: Clip; scene: SimScene } {
  const keys = clip.keys;
  let k: ClipKey | null = null;
  for (const x of keys) if (x.t <= fromT + 1e-6) k = x;
  const t0 = k ? k.t : 0;
  const t1 = clamp(toT, t0, clip.durS);
  const av = k ? rebaseAv(k.av, t0) : null;
  const folded = foldAt(clip.events, t0);
  const sc: SimScene = cloneData(scene);
  sc.id = newSceneId();
  if (k && av && sc.pose.kind === "exact")
    sc.pose = { kind: "exact", ac: { ...k.ac }, av };
  if (folded.ap) sc.ap = apSnapToScene(folded.ap);
  const fl = Object.entries(folded.failures).filter(([, v]) => v);
  if (fl.length) sc.failures = Object.fromEntries(fl);
  else delete sc.failures;
  delete sc.verify;
  const out: Clip = {
    ...clip,
    id: newSceneId("clip"),
    startScene: sc.id,
    durS: t1 - t0,
    samples: clip.samples
      .filter((s) => s.t >= t0 - 1e-6 && s.t <= t1 + 1e-6)
      .map((s) => ({ ...s, t: s.t - t0 })),
    keys: keysSlice(
      clip.keys.map((x) => ({ t: x.t, ac: x.ac, av: x.av })),
      t0,
      t1,
    ),
    events: trackSlice(clip.events as RecTrackEvent[], t0, t1),
    cues: clip.cues
      .filter((c) => c.t >= t0 && c.t <= t1)
      .map((c) => ({ ...c, t: c.t - t0 })),
  };
  return { clip: out, scene: sc };
}

// ---------------------------------------------------------------- folding events
interface Folded {
  ap: ApSnapshot | SceneAp | null;
  plan: PlanSnapshot | ScenePlan | null;
  failures: Record<string, boolean>;
}
function foldAt(events: readonly ClipEvent[], t: number): Folded {
  const out: Folded = { ap: null, plan: null, failures: {} };
  for (const e of events) {
    if (e.t > t + 1e-6) break;
    if (e.k === "ap") out.ap = e.patch as ApSnapshot;
    else if (e.k === "plan") out.plan = e.patch as PlanSnapshot;
    else if (e.k === "failure")
      Object.assign(out.failures, e.patch as Record<string, boolean>);
  }
  return out;
}
function apSnapToScene(a: ApSnapshot | SceneAp): SceneAp {
  return {
    engaged: a.engaged,
    fd: a.fd,
    lat: a.lat,
    vert: a.vert,
    armed: [...(a.armed ?? [])],
    hdg: a.hdg,
    alt: a.alt,
    vs: a.vs,
    ias: a.ias,
  };
}

// ---------------------------------------------------------------- the player
export interface ClipPlayerOptions {
  /** the clip's start scene: begin() applies it (a stage Sim). Without it the player runs on the Sim as it is. */
  scene?: SimScene;
  /** playback rate (default 1) */
  speed?: number;
  onCue?: (cue: ClipCue, index: number) => void;
  onEnd?: () => void;
}

interface PosePoint {
  t: number;
  lat: number;
  lon: number;
  /** true altitude (ft) */
  alt: number;
  hdg: number;
  pitch: number;
  bank: number;
  /** m/s */
  tas: number;
  gamma: number;
  ground: boolean;
  /** recorded indications (samples only) */
  ias?: number;
  vs?: number;
  key?: true;
}

export interface TakeOverResult {
  /** the clip time the student took over at (the keyframe at or before the requested time) */
  t: number;
  /** false when the clip had no keyframe there and the state was interpolated from the samples */
  exact: boolean;
}

export interface ClipMark {
  t: number;
  frac: number;
  kind: FlightEvent["kind"];
  text: string;
  fr?: string;
}

const MARK_RE = /FAF|Minimums|Touchdown|Liftoff/;

export class ClipPlayer {
  readonly sim: Sim;
  readonly clip: Clip;
  /** 'debrief': the cockpit's own flight replayed on its own Sim (restored by end()); 'stage': any other Sim */
  readonly mode: "stage" | "debrief";
  /** clip time (s) */
  t = 0;
  playing = false;
  speed: number;
  /** true once takeOver() handed the aircraft over */
  live = false;
  /** the flight record's events (debrief labels and marks), on the clip clock */
  readonly flightEvents: FlightEvent[];
  private readonly opts: ClipPlayerOptions;
  private restore: (() => void) | null = null;
  private avEvents: ClipEvent[];
  private nextCue = 0;
  private baseAv: Avionics | null = null;
  private baseAp: SceneAp | null = null;
  private baseFailures: Record<string, boolean> = {};
  private started = false;
  /** sim time of the clip's 0 (debrief: where the flight record starts) */
  readonly t0: number;

  constructor(
    sim: Sim,
    clip: Clip,
    opts: ClipPlayerOptions = {},
    internal?: { mode: "debrief"; t0: number; flightEvents: FlightEvent[] },
  ) {
    this.sim = sim;
    this.clip = clip;
    this.opts = opts;
    this.speed = opts.speed ?? 1;
    this.mode = internal?.mode ?? "stage";
    this.t0 = internal?.t0 ?? 0;
    this.flightEvents = internal?.flightEvents ?? [];
    this.avEvents = clip.events.filter((e) => e.k === "av");
  }

  /** The cockpit's debrief replay: the flight so far, on the same Sim. Null with fewer than 10 samples (5 s). */
  static fromRecorder(
    sim: Sim,
    rec: Recorder = sim.rec,
    opts: Omit<ClipPlayerOptions, "scene"> = {},
    /** sim time the replay stops at (an exercise's debrief ends with the exercise, not with the flight after it) */
    endT?: number,
  ): ClipPlayer | null {
    if (rec.samples.length < 10) return null;
    const t0 = rec.samples[0].t;
    const last = rec.samples[rec.samples.length - 1].t;
    const t1 =
      endT !== undefined && Number.isFinite(endT)
        ? Math.max(t0 + 1, Math.min(last, endT))
        : last;
    const clip: Clip = {
      id: "debrief",
      startScene: "",
      durS: t1 - t0,
      samples: samplesSlice(rec.samples, t0, t1),
      keys: keysSlice(rec.keys, t0, t1),
      events: trackSlice(rec.track, t0, t1),
      cues: [],
      source: "recorded",
    };
    const flightEvents = rec.events
      .filter((e) => e.t <= t1 + 0.5)
      .map((e) => ({ ...e, t: e.t - t0 }));
    return new ClipPlayer(sim, clip, opts, {
      mode: "debrief",
      t0,
      flightEvents,
    });
  }

  get durS(): number {
    return this.clip.durS;
  }
  get progress(): number {
    return this.durS > 0 ? this.t / this.durS : 0;
  }

  /** Start: a stage applies the start scene; the debrief saves the live state (end() restores it). Pauses the Sim:
   *  the player drives it (keep calling sim.step for the displays: a paused Sim only refreshes its avionics). */
  begin(): void {
    if (this.started) return;
    this.started = true;
    const sim = this.sim;
    if (this.mode === "debrief") this.restore = saveSim(sim);
    else if (this.opts.scene) applyScene(sim, this.opts.scene);
    const sc = this.opts.scene;
    this.baseAv = cloneAvionics(
      sc?.pose.kind === "exact" ? sc.pose.av : sim.av,
    );
    this.baseAp = sc?.ap ? apSnapToScene(sc.ap) : null;
    this.baseFailures = {
      ...((sc?.failures as Record<string, boolean>) ?? {}),
    };
    sim.paused = true;
    sim.replaying = true;
    this.live = false;
    this.seek(0);
  }

  /** Leave the player. The debrief restores the flight exactly as it was before the replay (unless taken over). */
  end(): void {
    this.playing = false;
    if (!this.started) return;
    this.started = false;
    const sim = this.sim;
    if (this.restore) {
      this.restore();
      this.restore = null;
      sim.updateAvionics(0);
    } else if (!this.live) sim.replaying = false;
  }

  play(): void {
    if (this.live) return;
    if (!this.started) this.begin();
    if (this.t >= this.durS - 1e-6) this.seek(0);
    this.playing = true;
  }
  pause(): void {
    this.playing = false;
  }
  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Show the clip at time t (clamped), paused or playing. */
  seek(t: number): void {
    if (this.live) return;
    if (!this.started) this.begin();
    this.t = clamp(t, 0, this.durS);
    const cues = this.clip.cues;
    this.nextCue = 0;
    while (this.nextCue < cues.length && cues[this.nextCue].t <= this.t + 1e-6)
      this.nextCue++;
    this.applyAt(this.t);
  }

  /** Advance by a real-time step while playing: cues fire on the way (a pause cue stops exactly at its time). */
  tick(dtReal: number): void {
    if (!this.playing || this.live || !this.started) return;
    let nt = this.t + Math.max(0, dtReal) * this.speed;
    const cues = this.clip.cues;
    while (this.nextCue < cues.length && cues[this.nextCue].t <= nt + 1e-9) {
      const i = this.nextCue++;
      const c = cues[i];
      this.opts.onCue?.(c, i);
      if (c.pause) {
        nt = c.t;
        this.playing = false;
        break;
      }
    }
    if (nt >= this.durS) {
      nt = this.durS;
      this.playing = false;
      this.t = nt;
      this.applyAt(nt);
      this.opts.onEnd?.();
      return;
    }
    this.t = nt;
    this.applyAt(nt);
  }

  // ---- the debrief slider works in sample index units (main.ts: min 0, max samples.length − 1, step 0.1)
  get pos(): number {
    const S = this.clip.samples;
    if (S.length < 2) return 0;
    const i = this.sampleIndex(this.t);
    const a = S[i];
    const b = S[Math.min(S.length - 1, i + 1)];
    return i + (b.t > a.t ? clamp((this.t - a.t) / (b.t - a.t), 0, 1) : 0);
  }
  set pos(p: number) {
    const S = this.clip.samples;
    if (!S.length) return;
    const i = clamp(Math.floor(p), 0, S.length - 1);
    const b = S[Math.min(S.length - 1, i + 1)];
    this.seek(S[i].t + (b.t - S[i].t) * clamp(p - i, 0, 1));
  }

  /** the latest flight event at or before t (the debrief bar's label) */
  eventAt(t = this.t): FlightEvent | null {
    let out: FlightEvent | null = null;
    for (const e of this.flightEvents) {
      if (e.t <= t + 1e-6) out = e;
      else break;
    }
    return out;
  }

  /** marks for the timeline: warnings, faults and the milestones of the flight (FAF, minimums, touchdown, liftoff) */
  marks(
    filter: (e: FlightEvent) => boolean = (e) =>
      e.kind !== "info" || MARK_RE.test(e.text),
  ): ClipMark[] {
    const d = Math.max(1, this.durS);
    return this.flightEvents
      .filter(filter)
      .map((e) => ({
        t: e.t,
        frac: clamp(e.t / d, 0, 1),
        kind: e.kind,
        text: e.text,
        ...(e.fr ? { fr: e.fr } : {}),
      }));
  }

  /** the cue on screen at t (the last one at or before it), for captions */
  cueAt(t = this.t): ClipCue | null {
    let out: ClipCue | null = null;
    for (const c of this.clip.cues) {
      if (c.t <= t + 1e-6) out = c;
      else break;
    }
    return out;
  }
  caption(lang: Lang = "en", t = this.t): string {
    const c = this.cueAt(t);
    const txt: L10n | undefined = c?.text;
    return txt ? (lang === "fr" ? (txt.fr ?? txt.en) : txt.en) : "";
  }

  /**
   * Hand the aircraft to the student at the keyframe at or before t (any cue, or anywhere at 1 s resolution): the
   * exact recorded state (velocities, rates, RPM, flaps), the throttle that holds that RPM, the autopilot modes and
   * bugs re-engaged bumpless, the Sim unpaused. The debrief truncates the flight record there and flies on.
   */
  takeOver(t = this.t): TakeOverResult {
    if (!this.started) this.begin();
    const sim = this.sim;
    const key = this.keyAt(t);
    const tk = key ? Math.max(0, key.t) : clamp(t, 0, this.durS);
    this.playing = false;
    this.seek(tk);
    const s = sim.ac.s;
    if (key) {
      Object.assign(s, { ...key.ac });
      const av = cloneAvionics(key.av);
      for (const e of this.avEvents) {
        if (e.t <= key.t + 1e-6) continue;
        if (e.t > tk + 1e-6) break;
        Object.assign(av, cloneData(e.patch as Partial<Avionics>));
      }
      Object.assign(sim.av, av);
    }
    sim.controls.throttle = throttleForRpm(sim, s.rpm);
    sim.controls.flaps = clamp(Math.round(s.flapPos * 3), 0, 3);
    sim.controls.elevator = 0;
    sim.controls.aileron = 0;
    sim.controls.rudder = 0;
    rederive(sim);
    const f = foldAt(this.clip.events, tk);
    const ap = f.ap ? apSnapToScene(f.ap) : this.baseAp;
    sim.ap.ap = false;
    sim.ap.fd = false;
    if (ap) applyApModes(sim, ap);
    if (this.mode === "debrief") {
      const abs = this.t0 + tk;
      sim.time = abs;
      if (sim.av.timerStart !== null) sim.av.timerStart += this.t0;
      truncateRecord(sim.rec, abs);
      this.restore = null;
    } else sim.time = tk;
    sim.paused = false;
    sim.replaying = false;
    this.live = true;
    sim.updateAvionics(0);
    sim.rec.resync(sim);
    return { t: tk, exact: !!key };
  }

  // ---- internals
  private sampleIndex(t: number): number {
    const S = this.clip.samples;
    let lo = 0;
    let hi = S.length - 1;
    if (hi <= 0 || t <= S[0].t) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (S[mid].t <= t + 1e-9) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** the keyframe at or before t */
  keyAt(t: number): ClipKey | null {
    const K = this.clip.keys;
    let out: ClipKey | null = null;
    for (const k of K) {
      if (k.t <= t + 1e-6) out = k;
      else break;
    }
    return out ?? (K.length && K[0].t <= 1e-6 ? K[0] : null);
  }

  private poses: PosePoint[] | null = null;
  /** samples and keys merged by time (a key replaces a sample within 20 ms): exact at every keyframe */
  private timeline(): PosePoint[] {
    if (this.poses) return this.poses;
    const sim = this.sim;
    const w = sim.weather;
    // the altimeter setting over time (samples hold the altitude the altimeter showed)
    const baro: { t: number; v: number }[] = [];
    for (const k of this.clip.keys) baro.push({ t: k.t, v: k.av.baro });
    for (const e of this.avEvents) {
      const b = (e.patch as Partial<Avionics>).baro;
      if (typeof b === "number") baro.push({ t: e.t, v: b });
    }
    baro.sort((x, y) => x.t - y.t);
    const baro0 = this.baseAv?.baro ?? sim.av.baro;
    let bi = -1;
    const out: PosePoint[] = [];
    for (const k of this.clip.keys) {
      const a = k.ac;
      out.push({ t: k.t, lat: a.lat, lon: a.lon, alt: a.altFt, hdg: a.psi / DEG, pitch: a.theta / DEG, bank: a.phi / DEG, tas: a.tas, gamma: a.gamma, ground: a.onGround, key: true });
    }
    for (const x of this.clip.samples) {
      while (bi + 1 < baro.length && baro[bi + 1].t <= x.t + 1e-9) bi++;
      const b = bi >= 0 ? baro[bi].v : baro0;
      const alt = x.alt - (b - w.qnh) * 1000;
      const ground = x.agl < 3;
      const tas = ground ? x.ias * KT : tasForIas(x.ias, alt, w, x.bank);
      const gamma = ground ? 0 : Math.asin(clamp((x.vs * FT) / 60 / Math.max(10, tas), -0.5, 0.5));
      out.push({ t: x.t, lat: x.lat, lon: x.lon, alt, hdg: x.hdg, pitch: x.pitch, bank: x.bank, tas, gamma, ground, ias: x.ias, vs: x.vs });
    }
    out.sort((p, q) => p.t - q.t || (p.key ? -1 : 1));
    const merged: PosePoint[] = [];
    for (const p of out) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(p.t - last.t) < 0.02) {
        if (p.key && !last.key) merged[merged.length - 1] = p;
        continue;
      }
      merged.push(p);
    }
    this.poses = merged;
    return merged;
  }

  private applyAt(t: number): void {
    const sim = this.sim;
    const s = sim.ac.s;
    sim.time = t;
    // 1 Hz exact base: the keyframe at or before t, then the avionics changes since it
    const key = this.keyAt(t);
    let av: Avionics;
    let from = -Infinity;
    if (key) {
      Object.assign(s, { ...key.ac });
      av = cloneAvionics(key.av);
      from = key.t;
    } else av = cloneAvionics(this.baseAv ?? sim.av);
    for (const e of this.avEvents) {
      if (e.t <= from + 1e-6) continue;
      if (e.t > t + 1e-6) break;
      Object.assign(av, cloneData(e.patch as Partial<Avionics>));
    }
    // autopilot (display), plan sequencing and failures at t
    const f = foldAt(this.clip.events, t);
    this.showAp(f.ap ?? this.baseAp);
    if (f.plan) this.showPlan(f.plan);
    const fail = sim.failures as unknown as Record<string, boolean>;
    const want = { ...this.baseFailures, ...f.failures };
    for (const k of Object.keys(fail)) fail[k] = !!want[k];
    // the pose: interpolated on the merged timeline of 2 Hz samples and 1 Hz exact keys (the keys' rates, RPM
    // and flaps stay as the base)
    const P = this.timeline();
    let ias: number | null = null;
    let vs: number | null = null;
    if (P.length) {
      let lo = 0;
      let hi = P.length - 1;
      if (t <= P[0].t) hi = 0;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (P[mid].t <= t + 1e-9) lo = mid;
        else hi = mid - 1;
      }
      const a = P[lo];
      const b = P[Math.min(P.length - 1, lo + 1)];
      const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
      const lerp = (x: number, y: number) => x + (y - x) * k;
      s.lat = lerp(a.lat, b.lat);
      s.lon = lerp(a.lon, b.lon);
      s.altFt = lerp(a.alt, b.alt);
      s.psi = ((((a.hdg + wrap180(b.hdg - a.hdg) * k) % 360) + 360) % 360) * DEG;
      s.theta = lerp(a.pitch, b.pitch) * DEG;
      s.phi = lerp(a.bank, b.bank) * DEG;
      s.tas = lerp(a.tas, b.tas);
      s.gamma = lerp(a.gamma, b.gamma);
      s.onGround = k < 0.5 ? a.ground : b.ground;
      if (a.ias !== undefined && b.ias !== undefined) ias = lerp(a.ias, b.ias);
      if (a.vs !== undefined && b.vs !== undefined) vs = lerp(a.vs, b.vs);
      s.crashed = null;
    }
    Object.assign(sim.av, av);
    rederive(sim);
    if (ias !== null) sim.ac.data.iasKt = ias; // the recorded indication, exactly
    if (vs !== null) sim.ac.data.vsFpm = vs;
    // the flight director's command bars are not recorded: shown on the aircraft symbol (a coupled autopilot
    // tracking its commands), never at a stale command
    sim.ap.bankCmd = sim.ac.data.rollDeg;
    sim.ap.pitchCmd = sim.ac.data.pitchDeg;
    sim.updateAvionics(0);
  }

  /** the autopilot's modes on the displays (FMA, bugs) without engaging anything */
  private showAp(ap: ApSnapshot | SceneAp | null): void {
    if (!ap) return;
    const A = this.sim.ap;
    A.ap = ap.engaged;
    A.fd = !!ap.fd || ap.engaged;
    A.lat = (ap.lat ?? "ROL") as LatMode;
    A.vert = (ap.vert ?? "PIT") as VertMode;
    const armed = ap.armed ?? [];
    A.latArmed =
      (armed.find((x) =>
        ["HDG", "GPS", "VOR", "LOC", "BC", "ROL"].includes(x),
      ) as LatMode | undefined) ?? null;
    A.vertArmed = {
      alts: armed.includes("ALTS"),
      gs: armed.includes("GS"),
      gp: armed.includes("GP"),
    };
    A.apprMode = armed.includes("APR");
    if (ap.hdg !== undefined) A.hdgBug = ap.hdg;
    if (ap.alt !== undefined) A.altSel = ap.alt;
    if (ap.vs !== undefined) A.vsSel = ap.vs;
    if (ap.ias !== undefined) A.iasSel = ap.ias;
  }

  /** the active waypoint and approach state on the displays (the plan itself is the start scene's) */
  private showPlan(p: PlanSnapshot | ScenePlan): void {
    const fp = this.sim.fp;
    if ("n" in p) {
      let i = p.active;
      if (fp.wpts[i]?.ident !== p.to) {
        const j = fp.wpts.findIndex((w) => w.ident === p.to);
        if (j >= 0) i = j;
      }
      if (i >= 0 && i < fp.wpts.length) fp.active = i;
      fp.approachActive = p.approachActive && !!fp.approachId;
      fp.missedActive = p.missedActive && !!fp.approachId;
      fp.vtf = p.vtf;
      fp.holdActive = p.holdActive && !!fp.wpts[fp.active]?.hold;
    } else if (p.activeLeg !== undefined && p.activeLeg < fp.wpts.length)
      fp.active = p.activeLeg;
  }
}

/** the flight record up to sim time t (a debrief take-over flies on from there) */
function truncateRecord(rec: Recorder, t: number): void {
  rec.samples = rec.samples.filter((s) => s.t <= t + 1e-6);
  rec.keys = rec.keys.filter((k) => k.t <= t + 1e-6);
  rec.track = rec.track.filter((e) => e.t <= t + 1e-6);
  rec.events = rec.events.filter((e) => e.t <= t + 1e-6);
  rec.actions = rec.actions.filter((a) => a.t <= t + 1e-6);
  if (rec.touchdown && rec.touchdown.t > t) rec.touchdown = null;
  if (rec.missedAt !== null && rec.missedAt > t) rec.missedAt = null;
  rec.crashed = null;
  rec.log(
    t,
    "info",
    "Taken over from the replay",
    "Reprise des commandes depuis le rejeu",
  );
}
