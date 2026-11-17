// A flight in the simulator left without a result (audit §45): the step says so whenever the course is opened again,
// with or without the token of the flight (the library's « Reprendre », Accueil, the loading card's « Annuler »).
import type { AttemptRecord, Handoff, Lang } from "../types";

/** the flight this step opened last, when the page came back without its token (the library's « Reprendre »,
 *  Accueil, the loading card's « Annuler »): the newest hand-off of this course and step (audit §45) */
export function lastFlyHandoff(
  all: readonly Handoff[],
  courseId: string,
  stepId: string,
): Handoff | null {
  let best: Handoff | null = null;
  for (const hd of all)
    if (hd.courseId === courseId && hd.stepId === stepId && (!best || hd.created > best.created)) best = hd;
  return best;
}
/** true when that flight was opened in the cockpit after the last recorded attempt, and never came back with one */
export function leftUnfinished(hd: Handoff | null, last: AttemptRecord | null): boolean {
  if (!hd?.consumed) return false;
  return !last || last.at < hd.consumed;
}

export interface LeftFlight {
  /** when it was left (the hand-off opened in the cockpit, or the stopped attempt) */
  at: string;
  /** how long it was flown, when the cockpit recorded a stopped attempt */
  secs?: number;
}
/** The step's last flight, when it ended without a result and nothing newer was recorded: a stopped (ungraded)
 *  attempt, or a hand-off opened in the cockpit that never came back. Pure. */
export function lastLeftFlight(hd: Handoff | null, attempts: readonly AttemptRecord[]): LeftFlight | null {
  const mine = attempts.filter((a) => a.kind === "fly" || a.kind === "yourTurn").sort((a, b) => a.at.localeCompare(b.at));
  const last = mine[mine.length - 1] ?? null;
  if (hd && leftUnfinished(hd, last)) return { at: hd.consumed! };
  if (last?.kind === "fly" && last.fly?.ungraded) return { at: last.at, secs: last.secs };
  return null;
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
/** « Vol interrompu à 2:50 · pas de résultat. » and the way to fly it again */
export function leftFlightLine(f: LeftFlight, again: string, lang: Lang): string {
  const fr = lang === "fr";
  const when = f.secs && f.secs >= 1 ? (fr ? ` à ${mmss(f.secs)}` : ` at ${mmss(f.secs)}`) : "";
  return fr
    ? `Vol interrompu${when} · pas de résultat. « ${again} » pour revoler.`
    : `Flight stopped${when} · no result. “${again}” to fly it again.`;
}
