// Ground school — designed slides: the undo / redo stack (package N). Snapshots of plain JSON values (a slide is
// small: a few KB), with coalescing so a drag, a nudge burst or typing is one undo step. Pure, no DOM.

export interface HistoryOptions {
  /** steps kept (oldest dropped) */
  limit?: number;
  /** pushes with the same key within this window merge into one step (ms) */
  coalesceMs?: number;
  now?: () => number;
}

export class History<T> {
  private past: string[] = [];
  private future: string[] = [];
  private cur: string;
  private lastKey: string | null = null;
  private lastT = -Infinity;
  private limit: number;
  private coalesceMs: number;
  private now: () => number;
  constructor(initial: T, o: HistoryOptions = {}) {
    this.cur = JSON.stringify(initial);
    this.limit = o.limit ?? 200;
    this.coalesceMs = o.coalesceMs ?? 800;
    this.now = o.now ?? (() => Date.now());
  }
  /** the current value (a fresh copy) */
  get value(): T {
    return JSON.parse(this.cur) as T;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get depth(): { undo: number; redo: number } {
    return { undo: this.past.length, redo: this.future.length };
  }
  /**
   * Record a new state. `key` names the gesture ('move:b3', 'nudge', 'text:b2'): a push with the same key as the
   * previous one, within the window, replaces the current state without adding an undo step. Returns false when
   * nothing changed.
   */
  push(next: T, key?: string): boolean {
    const s = JSON.stringify(next);
    if (s === this.cur) return false;
    const t = this.now();
    const merge =
      key !== undefined &&
      key === this.lastKey &&
      t - this.lastT <= this.coalesceMs &&
      this.past.length > 0;
    if (!merge) {
      this.past.push(this.cur);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.cur = s;
    this.future = [];
    this.lastKey = key ?? null;
    this.lastT = t;
    return true;
  }
  /** End the current gesture: the next push starts a new undo step even with the same key. */
  seal() {
    this.lastKey = null;
  }
  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.cur);
    this.cur = prev;
    this.lastKey = null;
    return this.value;
  }
  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.cur);
    this.cur = next;
    this.lastKey = null;
    return this.value;
  }
  /** Replace everything (a slide loaded from elsewhere). */
  reset(value: T) {
    this.past = [];
    this.future = [];
    this.cur = JSON.stringify(value);
    this.lastKey = null;
  }
}
