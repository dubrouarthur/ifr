// The cockpit's rewind ring (SPEC §9.2): the last 120 s as exact SimScenes at 1 Hz (≈ 2 KB each, ≤ 400 KB in all).
// It gives "Back 10 s" (scrub to the exact second, capture it, or fly on from it) and is the source of Shift+C clips
// (ClipRecorder.fromRing). Events between successive scenes are diffed here when the recorder's own event track is
// not available.
//
// Life cycle: the cockpit bridge calls tick(sim) every frame. The ring clears itself when the Sim is reloaded (its
// clock goes backwards or its aircraft is replaced) and never captures while the sim is paused or replaying.
import type { Sim } from "../sim/sim";
import { diffAvionics } from "../sim/recorder";
import type { Clip, SimScene } from "./types";
import {
  apAnnunciation,
  captureScene,
  poseScene,
  type CaptureOptions,
} from "./scene";

export interface RewindFrame {
  /** sim time of the capture */
  t: number;
  scene: SimScene;
}

export type RingEvent = Clip["events"][number];

export interface RewindOptions {
  /** frames kept (default 120) */
  capacity?: number;
  /** seconds between frames (default 1) */
  periodS?: number;
  /** what the captures say about the cockpit (cockpit type, world): read at each capture */
  capture?: () => CaptureOptions;
}

export class RewindRing {
  readonly capacity: number;
  readonly periodS: number;
  private buf: RewindFrame[] = [];
  private lastT = -Infinity;
  private ac: unknown = null;
  private opts: RewindOptions;
  private live: { scene: SimScene; paused: boolean } | null = null;

  constructor(opts: RewindOptions = {}) {
    this.opts = opts;
    this.capacity = Math.max(2, Math.round(opts.capacity ?? 120));
    this.periodS = Math.max(0.1, opts.periodS ?? 1);
  }

  /** oldest first */
  get frames(): readonly RewindFrame[] {
    return this.buf;
  }
  get length(): number {
    return this.buf.length;
  }
  get oldest(): RewindFrame | null {
    return this.buf[0] ?? null;
  }
  get newest(): RewindFrame | null {
    return this.buf[this.buf.length - 1] ?? null;
  }
  /** seconds covered */
  get spanS(): number {
    return this.buf.length
      ? this.buf[this.buf.length - 1].t - this.buf[0].t
      : 0;
  }
  /** true between preview() and endPreview() / resumeFrom() */
  get previewing(): boolean {
    return this.live !== null;
  }

  clear(): void {
    this.buf = [];
    this.lastT = -Infinity;
  }

  /** Call every frame. Captures when a period has passed; returns true when it captured. */
  tick(sim: Sim): boolean {
    if (this.live || sim.paused || sim.replaying) return false;
    if (sim.ac !== this.ac || sim.time < this.lastT - 1e-6) {
      // a new flight (Sim.load builds a new Aircraft and restarts the clock)
      this.clear();
      this.ac = sim.ac;
    }
    if (sim.time - this.lastT < this.periodS - 1e-6) return false;
    this.push(sim);
    return true;
  }

  /** capture now, whatever the period (e.g. right before a clip is cut) */
  push(sim: Sim): RewindFrame {
    const o = this.opts.capture?.() ?? {};
    const scene = captureScene(sim, {
      from: "rewind",
      ...o,
      id: `rw-${Math.round(sim.time * 10)}`,
    });
    const f: RewindFrame = { t: sim.time, scene };
    if (this.buf.length && this.buf[this.buf.length - 1].t >= f.t)
      this.buf.pop();
    this.buf.push(f);
    if (this.buf.length > this.capacity)
      this.buf.splice(0, this.buf.length - this.capacity);
    this.lastT = f.t;
    this.ac = sim.ac;
    return f;
  }

  /** the frame at or before t (the oldest one when t is older) */
  at(t: number): RewindFrame | null {
    const b = this.buf;
    if (!b.length) return null;
    if (t <= b[0].t) return b[0];
    let lo = 0;
    let hi = b.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (b[mid].t <= t + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return b[lo];
  }

  /** the frame `seconds` before the newest one */
  ago(seconds: number): RewindFrame | null {
    const n = this.newest;
    return n ? this.at(n.t - seconds) : null;
  }

  /** frames with fromT ≤ t ≤ toT */
  range(fromT: number, toT: number): RewindFrame[] {
    return this.buf.filter((f) => f.t >= fromT - 1e-6 && f.t <= toT + 1e-6);
  }

  /** Avionics, autopilot, plan and failure changes between successive frames in [fromT, toT], at the frame that
   *  shows them (1 s resolution; the recorder's track is exact to the frame). */
  events(fromT: number, toT: number): RingEvent[] {
    const fr = this.range(fromT, toT);
    const out: RingEvent[] = [];
    for (let i = 1; i < fr.length; i++)
      out.push(...diffScenes(fr[i - 1], fr[i]));
    return out;
  }

  /** approximate memory (bytes of JSON) */
  bytes(): number {
    let n = 0;
    for (const f of this.buf) n += JSON.stringify(f.scene).length;
    return n;
  }

  /** Scrub: pause the sim and show it at the frame at or before t (the live state is kept for endPreview). */
  preview(sim: Sim, t: number): RewindFrame | null {
    const f = this.at(t);
    if (!f) return null;
    if (!this.live)
      this.live = {
        scene: captureScene(sim, {
          from: "rewind",
          ...(this.opts.capture?.() ?? {}),
        }),
        paused: sim.paused,
      };
    sim.paused = true;
    poseScene(sim, f.scene);
    return f;
  }

  /** leave the scrub: back to the live state as it was */
  endPreview(sim: Sim): void {
    if (!this.live) return;
    poseScene(sim, this.live.scene);
    sim.paused = this.live.paused;
    this.live = null;
  }

  /** Fly on from the frame at or before t: the later frames are dropped, the flight record notes the rewind. */
  resumeFrom(sim: Sim, t: number): RewindFrame | null {
    const f = this.at(t);
    if (!f) return null;
    const wasPaused = this.live ? this.live.paused : sim.paused;
    this.live = null;
    const back = (this.newest?.t ?? sim.time) - f.t;
    poseScene(sim, f.scene);
    this.buf = this.buf.filter((x) => x.t <= f.t);
    sim.paused = wasPaused;
    const s = Math.round(back);
    sim.rec.log(
      sim.time,
      "info",
      `Rewind: back ${s} s`,
      `Retour arrière : ${s} s`,
    );
    sim.rec.resync(sim);
    // the ring restarts its period from the resumed frame, on the sim's (still running) clock
    this.lastT = sim.time;
    this.buf = this.buf.map((x) => ({ ...x, t: x.t - f.t + sim.time }));
    return f;
  }
}

/** the changes from one frame to the next, as clip events at the later frame's time */
export function diffScenes(a: RewindFrame, b: RewindFrame): RingEvent[] {
  const out: RingEvent[] = [];
  const pa = a.scene.pose;
  const pb = b.scene.pose;
  if (pa.kind === "exact" && pb.kind === "exact") {
    // the chronometer is stored relative to each capture: compare it on the sim clock
    const avA = {
      ...pa.av,
      timerStart: pa.av.timerStart === null ? null : pa.av.timerStart + a.t,
    };
    const avB = {
      ...pb.av,
      timerStart: pb.av.timerStart === null ? null : pb.av.timerStart + b.t,
    };
    const d = diffAvionics(avA, avB);
    if (d) out.push({ t: b.t, k: "av", patch: d });
  }
  const apA = a.scene.ap;
  const apB = b.scene.ap;
  if (
    apB &&
    (!apA ||
      apAnnunciation(apA) !== apAnnunciation(apB) ||
      apA.hdg !== apB.hdg ||
      apA.alt !== apB.alt ||
      apA.vs !== apB.vs ||
      apA.ias !== apB.ias)
  )
    out.push({
      t: b.t,
      k: "ap",
      patch: { ...apB, armed: [...(apB.armed ?? [])] },
    });
  if (
    JSON.stringify(a.scene.plan ?? null) !==
    JSON.stringify(b.scene.plan ?? null)
  )
    out.push({ t: b.t, k: "plan", patch: b.scene.plan ?? null });
  const fa = (a.scene.failures ?? {}) as Record<string, boolean>;
  const fb = (b.scene.failures ?? {}) as Record<string, boolean>;
  let fail: Record<string, boolean> | null = null;
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)]))
    if (!!fa[k] !== !!fb[k]) (fail ??= {})[k] = !!fb[k];
  if (fail) out.push({ t: b.t, k: "failure", patch: fail });
  return out;
}
