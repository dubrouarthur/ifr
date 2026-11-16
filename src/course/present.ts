// Presenter ↔ projector sync (package G, SPEC §6.3): one laptop, two windows, no network. The console posts on the
// BroadcastChannel 'ifr-course-present'; the projector follows (step, reveal, black screen, the stage pose at
// ≤10 Hz while the stage is live). The projector never simulates alone, so it cannot drift from the console.
import type { Lang, PresentMsg, StagePose } from "./types";

export const PRESENT_CHANNEL = "ifr-course-present";
/** the stage pose is mirrored at most this often (ms) */
export const STAGE_PERIOD_MS = 100;
/** the slide's aircraft while it flies (the presenter's demonstration, a strip in use): 20 Hz, smooth needles */
export const SIMS_PERIOD_MS = 50;
/** the slide's aircraft at rest (a knob turned on a frozen instrument): 4 Hz is enough */
export const SIMS_IDLE_MS = 250;

/** The aircraft of one situation of the slide, as the projector needs it to draw the same instruments. */
export interface SimMirrorWire {
  id: string;
  pose: StagePose;
  av: Record<string, unknown>;
  ap: { hdgBug: number; altSel: number };
  rpm: number;
  thr: number;
  fail: string[];
}
/** who flies the slide's aircraft (the projector's badge): the instructor's demonstration, or a student */
export type DemoWhoWire = "instructor" | "student" | null;

/** PresentMsg plus the two handshake messages of the wire (additive, local to the two windows). */
export type PresentWire =
  | PresentMsg
  | { t: "hello"; courseId: string }
  | { t: "lang"; lang: Lang }
  /** the slide's instruments: the console's aircraft (the projector draws it, never flies it) */
  | { t: "sims"; stepId: string; who: DemoWhoWire; list: SimMirrorWire[] }
  /** an animation of the slide replayed / paused / resumed by the presenter (the projector plays its own copy) */
  | { t: "anim"; stepId: string; id: string; op: "replay" | "pause" | "resume" }
  /** the presenter went into the simulator (the projector says the course resumes here) */
  | { t: "away"; on: boolean };

export interface PresentLink {
  post(m: PresentWire): void;
  on(f: (m: PresentWire) => void): () => void;
  close(): void;
  /** false when this browser has no BroadcastChannel (the projector then cannot follow) */
  readonly ok: boolean;
}

/** Keep only the messages a course window should act on (the channel is shared by every academy tab). */
export function isPresentWire(x: unknown): x is PresentWire {
  if (!x || typeof x !== "object") return false;
  const t = (x as { t?: unknown }).t;
  return (
    t === "course" ||
    t === "goto" ||
    t === "stage" ||
    t === "action" ||
    t === "clip" ||
    t === "black" ||
    t === "calc" ||
    t === "bye" ||
    t === "hello" ||
    t === "lang" ||
    t === "sims" ||
    t === "anim" ||
    t === "away"
  );
}

export function presentLink(
  courseId: string,
  factory?: (name: string) => BroadcastChannel | null,
): PresentLink {
  let ch: BroadcastChannel | null = null;
  try {
    ch = factory
      ? factory(PRESENT_CHANNEL)
      : typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(PRESENT_CHANNEL);
  } catch {
    ch = null;
  }
  const subs = new Set<(m: PresentWire) => void>();
  const onMsg = (e: MessageEvent) => {
    const d = e.data as { course?: string; m?: unknown } | null;
    if (!d || d.course !== courseId || !isPresentWire(d.m)) return;
    for (const f of subs) f(d.m);
  };
  ch?.addEventListener("message", onMsg);
  return {
    ok: !!ch,
    post(m) {
      try {
        ch?.postMessage({ course: courseId, m });
      } catch {
        /* closed */
      }
    },
    on(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
    close() {
      ch?.removeEventListener("message", onMsg);
      ch?.close();
      subs.clear();
    },
  };
}

/** "12:05" */
export function clockText(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
/** Elapsed against planned: 'ahead' under 90 %, 'late' over 110 %. */
export function pace(
  elapsedS: number,
  plannedMin: number,
): "ok" | "late" | "ahead" {
  if (!plannedMin) return "ok";
  const r = elapsedS / 60 / plannedMin;
  return r > 1.1 ? "late" : r < 0.9 ? "ahead" : "ok";
}
