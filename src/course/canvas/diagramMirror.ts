// The drawings a presenter works on a slide (the hold's arrival heading, the wind, pause / replay): one hub per slide
// view. The console listens and posts each change on the BroadcastChannel (course/present.ts, `diagram`); the
// projector applies it to the same block, so the class sees the entry the instructor is talking about.
import type { DiagramLive } from "../stage/svgkit";

export type { DiagramLive };
/** A drawing that can be mirrored: its live state, and the same state applied from the other window. */
export interface MirrorTarget {
  live(): DiagramLive;
  follow(st: DiagramLive): void;
}

export class DiagramHub {
  private items = new Map<string, MirrorTarget>();
  private subs = new Set<(id: string, st: DiagramLive) => void>();
  /** applying a state from the other window: no echo */
  private quiet = false;

  /** a block's drawing (by block id); returns the way to remove it */
  add(id: string, t: MirrorTarget): () => void {
    this.items.set(id, t);
    return () => {
      if (this.items.get(id) === t) this.items.delete(id);
    };
  }
  /** the drawing of block `id` changed (a heading set, the wind turned, paused, replayed) */
  changed(id: string): void {
    if (this.quiet) return;
    const t = this.items.get(id);
    if (!t) return;
    const st = t.live();
    for (const f of this.subs) f(id, st);
  }
  on(f: (id: string, st: DiagramLive) => void): () => void {
    this.subs.add(f);
    return () => this.subs.delete(f);
  }
  /** the other window's state, on the same block; false when this slide has no such drawing */
  apply(id: string, st: DiagramLive): boolean {
    const t = this.items.get(id);
    if (!t) return false;
    this.quiet = true;
    try {
      t.follow(st);
    } finally {
      this.quiet = false;
    }
    return true;
  }
  /** every drawing's state now (a projector opened late catches up) */
  snapshot(): [string, DiagramLive][] {
    return [...this.items].map(([id, t]) => [id, t.live()]);
  }
  get size(): number {
    return this.items.size;
  }
}
