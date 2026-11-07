// Ground school — designed slides: the editing controller (package N). Pure (no DOM): the selection, the pointer
// gestures (move, resize, rotate, arrow ends, a callout's leader, marquee) with grid snapping and alignment
// guides, the commands (duplicate, delete, group, lock, z-order, align, nudge, copy / paste) and the keyboard map,
// over an undo / redo History. editor.ts turns pointer and key events into these calls and draws the overlay.
import type { Pt, SlideBlock, SlideCanvas } from "../types";
import {
  aabb,
  DEFAULT_GRID,
  hitTest,
  marquee,
  normBox,
  resizeFrame,
  rotationAt,
  snap,
  snapMove,
  type Box,
  type Guide,
  type Handle,
} from "./geom";
import {
  addBlock,
  alignBlocks,
  blockById,
  distributeBlocks,
  duplicateBlocks,
  expandGroups,
  groupBlocks,
  moveBlocks,
  nudge,
  reframeBlock,
  removeBlocks,
  reorder,
  scaleBlocks,
  selectionBox,
  setArrowEnds,
  setLocked,
  ungroupBlocks,
  updateBlock,
  type Align,
  type ZMove,
} from "./ops";
import { History } from "./history";
import { placeDraft, type BlockDraft } from "./factory";

export interface Mods {
  shift?: boolean;
  alt?: boolean;
  /** Cmd on macOS, Ctrl elsewhere */
  meta?: boolean;
}
export type EditorCommand =
  | { k: "undo" }
  | { k: "redo" }
  | { k: "delete" }
  | { k: "duplicate" }
  | { k: "group" }
  | { k: "ungroup" }
  | { k: "lock" }
  | { k: "unlock" }
  | { k: "toggleLock" }
  | { k: "z"; how: ZMove }
  | { k: "align"; how: Align }
  | { k: "distribute"; axis: "h" | "v" }
  | { k: "nudge"; dx: number; dy: number }
  | { k: "selectAll" }
  | { k: "deselect" }
  | { k: "cycle"; dir: 1 | -1 }
  | { k: "copy" }
  | { k: "cut" }
  | { k: "paste" }
  | { k: "edit" };

type Gesture =
  | {
      k: "move";
      start: SlideCanvas;
      ids: string[];
      origin: Pt;
      box: Box;
      moved: boolean;
      tapId: string | null;
    }
  | {
      k: "resize";
      start: SlideCanvas;
      ids: string[];
      handle: Handle;
      origin: Pt;
      box: Box;
    }
  | { k: "rotate"; start: SlideCanvas; id: string }
  | { k: "end"; start: SlideCanvas; id: string; end: "from" | "to" }
  | { k: "target"; start: SlideCanvas; id: string }
  | { k: "marquee"; origin: Pt; base: string[] };

/** Blocks that keep their aspect ratio when resized (Shift inverts it). */
export function keepsAspect(b: SlideBlock): boolean {
  return (
    b.kind === "instrument" ||
    b.kind === "marker" ||
    (b.kind === "image" && b.fit === "contain")
  );
}

/** The shared clipboard (copy on one slide, paste on another): plain JSON blocks. */
let clipboard: SlideBlock[] = [];

export interface EditorCoreOptions {
  /** every change (live during a gesture); `final` at a gesture's end and for commands */
  onChange?: (c: SlideCanvas, final: boolean) => void;
  onSelect?: (ids: string[]) => void;
  now?: () => number;
}

export class EditorCore {
  canvas: SlideCanvas;
  selection: string[] = [];
  readonly history: History<SlideCanvas>;
  /** alignment guides to draw (slide units) */
  guides: Guide[] = [];
  /** the marquee being dragged (slide units) */
  marqueeBox: Box | null = null;
  /** snapping to guides and the grid (Alt during a drag turns it off) */
  snapOn = true;
  private g: Gesture | null = null;
  constructor(
    canvas: SlideCanvas,
    private o: EditorCoreOptions = {},
  ) {
    this.canvas = canvas;
    this.history = new History(canvas, { now: o.now });
  }
  get grid(): number {
    return this.canvas.grid ?? DEFAULT_GRID;
  }
  get gesture(): Gesture["k"] | null {
    return this.g?.k ?? null;
  }
  get selected(): SlideBlock[] {
    return this.canvas.blocks.filter((b) => this.selection.includes(b.id));
  }
  get selectionBox(): Box | null {
    return selectionBox(this.canvas, this.selection);
  }

  // ---------------------------------------------------------------- state
  /** Replace the canvas from outside (an inspector edit): one undo step. */
  apply(next: SlideCanvas, key?: string, final = true) {
    if (next === this.canvas) return;
    this.canvas = next;
    this.history.push(next, key);
    if (final) this.history.seal();
    // drop ids that no longer exist
    const ids = new Set(next.blocks.map((b) => b.id));
    const sel = this.selection.filter((id) => ids.has(id));
    if (sel.length !== this.selection.length) this.setSelection(sel);
    this.o.onChange?.(next, final);
  }
  /** Load another slide: a fresh history. */
  load(c: SlideCanvas) {
    this.canvas = c;
    this.history.reset(c);
    this.g = null;
    this.guides = [];
    this.marqueeBox = null;
    this.setSelection([]);
  }
  setSelection(ids: readonly string[]) {
    const next = [...new Set(ids)];
    if (
      next.length === this.selection.length &&
      next.every((id, i) => id === this.selection[i])
    )
      return;
    this.selection = next;
    this.o.onSelect?.(next);
  }
  /** Select blocks (whole groups); `additive` toggles them in the current selection. */
  select(ids: readonly string[], additive = false) {
    const grown = expandGroups(this.canvas, ids);
    if (!additive) return this.setSelection(grown);
    const cur = new Set(this.selection);
    const allIn = grown.every((id) => cur.has(id));
    for (const id of grown) allIn ? cur.delete(id) : cur.add(id);
    this.setSelection(
      this.canvas.blocks.filter((b) => cur.has(b.id)).map((b) => b.id),
    );
  }
  updateBlock(
    id: string,
    patch: Partial<SlideBlock> | ((b: SlideBlock) => SlideBlock),
    key?: string,
  ) {
    this.apply(updateBlock(this.canvas, id, patch), key ?? `edit:${id}`, !key);
  }
  /** Add a library draft centred at `at` (default the slide centre) and select it. */
  addDraft(d: BlockDraft, at?: Pt): SlideBlock {
    const b = placeDraft(this.canvas, d, at, this.grid);
    this.apply(addBlock(this.canvas, b));
    const added = this.canvas.blocks[this.canvas.blocks.length - 1];
    this.setSelection([added.id]);
    return added;
  }

  // ---------------------------------------------------------------- pointer gestures (slide units)
  /**
   * Pointer down on the canvas (not on a handle). Returns what started: a move of the block under p (selected
   * first, Shift toggles), or a marquee on empty space. `tol` is the hit tolerance in slide units.
   */
  pointerDown(p: Pt, mods: Mods = {}, tol = 8): "move" | "marquee" {
    const hit = hitTest(this.canvas.blocks, p, { pad: tol });
    if (!hit) {
      this.g = {
        k: "marquee",
        origin: p,
        base: mods.shift ? [...this.selection] : [],
      };
      if (!mods.shift) this.setSelection([]);
      this.marqueeBox = { x: p[0], y: p[1], w: 0, h: 0 };
      return "marquee";
    }
    const wasSelected = this.selection.includes(hit.id);
    if (mods.shift) this.select([hit.id], true);
    else if (!wasSelected) this.select([hit.id]);
    const ids = this.selection.filter(
      (id) => !blockById(this.canvas, id)?.frame.locked,
    );
    this.g = {
      k: "move",
      start: this.canvas,
      ids,
      origin: p,
      box: selectionBox(this.canvas, ids) ?? aabb(hit.frame),
      moved: false,
      // a plain tap on a block of a multi-selection narrows the selection to it (on release)
      tapId:
        wasSelected && !mods.shift && this.selection.length > 1 ? hit.id : null,
    };
    return "move";
  }
  beginResize(handle: Handle, p: Pt) {
    const ids = this.selection.filter(
      (id) => !blockById(this.canvas, id)?.frame.locked,
    );
    const box = selectionBox(this.canvas, ids);
    if (!ids.length || !box) return;
    this.g = { k: "resize", start: this.canvas, ids, handle, origin: p, box };
  }
  beginRotate() {
    const b = this.single();
    if (!b || b.frame.locked || b.kind === "arrow") return;
    this.g = { k: "rotate", start: this.canvas, id: b.id };
  }
  beginArrowEnd(end: "from" | "to") {
    const b = this.single();
    if (!b || b.kind !== "arrow" || b.frame.locked) return;
    this.g = { k: "end", start: this.canvas, id: b.id, end };
  }
  beginTarget() {
    const b = this.single();
    if (!b || b.kind !== "callout" || !b.target || b.frame.locked) return;
    this.g = { k: "target", start: this.canvas, id: b.id };
  }
  /** the single selected block (or null) */
  single(): SlideBlock | null {
    return this.selection.length === 1
      ? (blockById(this.canvas, this.selection[0]) ?? null)
      : null;
  }
  pointerMove(p: Pt, mods: Mods = {}) {
    const g = this.g;
    if (!g) return;
    const snapping = this.snapOn && !mods.alt;
    const grid = snapping ? this.grid : 0;
    if (g.k === "marquee") {
      this.marqueeBox = normBox(g.origin, p);
      const hit = marquee(this.canvas.blocks, this.marqueeBox).map((b) => b.id);
      this.setSelection(expandGroups(this.canvas, [...g.base, ...hit]));
      return;
    }
    if (g.k === "move") {
      let dx = p[0] - g.origin[0];
      let dy = p[1] - g.origin[1];
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      if (mods.shift) {
        // constrain to the dominant axis
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const moving: Box = { ...g.box, x: g.box.x + dx, y: g.box.y + dy };
      if (snapping) {
        const others = g.start.blocks
          .filter((b) => !g.ids.includes(b.id) && !b.hiddenInEditor)
          .map((b) => aabb(b.frame));
        const s = snapMove(moving, others, { grid, threshold: 10 });
        dx += s.dx;
        dy += s.dy;
        this.guides = s.guides;
      } else this.guides = [];
      this.live(
        moveBlocks(g.start, g.ids, Math.round(dx), Math.round(dy)),
        `move:${g.ids.join(",")}`,
      );
      return;
    }
    if (g.k === "resize") {
      const dx = p[0] - g.origin[0];
      const dy = p[1] - g.origin[1];
      if (g.ids.length === 1) {
        const b = blockById(g.start, g.ids[0])!;
        const keep = keepsAspect(b) !== !!mods.shift;
        const f = resizeFrame(b.frame, g.handle, dx, dy, {
          keepAspect: keep,
          fromCenter: false,
          grid: b.frame.rot ? 0 : grid,
        });
        const r = {
          ...f,
          x: Math.round(f.x),
          y: Math.round(f.y),
          w: Math.round(f.w),
          h: Math.round(f.h),
        };
        this.live(
          updateBlock(g.start, b.id, () => reframeBlock(b, r)),
          `resize:${b.id}`,
        );
      } else {
        const f = resizeFrame({ ...g.box, z: 0 }, g.handle, dx, dy, {
          keepAspect: !mods.shift,
          grid,
        });
        this.live(
          scaleBlocks(g.start, g.ids, g.box, f),
          `resize:${g.ids.join(",")}`,
        );
      }
      return;
    }
    if (g.k === "rotate") {
      const b = blockById(g.start, g.id)!;
      const rot = Math.round(rotationAt(b.frame, p, mods.shift ? 15 : 0));
      const f = { ...b.frame };
      if (rot) f.rot = rot;
      else delete f.rot;
      this.live(updateBlock(g.start, b.id, { frame: f }), `rotate:${b.id}`);
      return;
    }
    if (g.k === "end") {
      const b = blockById(g.start, g.id);
      if (!b || b.kind !== "arrow") return;
      const q: Pt = grid
        ? [snap(p[0], grid / 2), snap(p[1], grid / 2)]
        : [Math.round(p[0]), Math.round(p[1])];
      const from = g.end === "from" ? q : b.from;
      const to = g.end === "to" ? q : b.to;
      this.live(
        updateBlock(g.start, b.id, () => setArrowEnds(b, from, to)),
        `end:${b.id}`,
      );
      return;
    }
    if (g.k === "target") {
      const q: Pt = [Math.round(p[0]), Math.round(p[1])];
      this.live(
        updateBlock(g.start, g.id, { target: q } as Partial<SlideBlock>),
        `target:${g.id}`,
      );
    }
  }
  /** Pointer up: ends the gesture (one undo step). Returns true when the canvas changed. */
  pointerUp(): boolean {
    const g = this.g;
    this.g = null;
    this.guides = [];
    this.marqueeBox = null;
    if (!g) return false;
    if (g.k === "marquee") return false;
    if (g.k === "move" && !g.moved) {
      if (g.tapId) this.select([g.tapId]);
      return false;
    }
    const changed = "start" in g && g.start !== this.canvas;
    this.history.seal();
    if (changed) this.o.onChange?.(this.canvas, true);
    return changed;
  }
  /** Escape during a gesture: back to where it started. */
  cancel() {
    const g = this.g;
    this.g = null;
    this.guides = [];
    this.marqueeBox = null;
    if (g && "start" in g && g.start !== this.canvas) {
      this.canvas = g.start;
      this.history.push(g.start, "cancel");
      this.history.seal();
      this.o.onChange?.(g.start, true);
    }
  }
  private live(next: SlideCanvas, key: string) {
    this.canvas = next;
    this.history.push(next, key);
    this.o.onChange?.(next, false);
  }

  // ---------------------------------------------------------------- commands
  /** Run a command; false when it did nothing (so the key can do its default). */
  run(c: EditorCommand): boolean {
    const sel = this.selection;
    const has = sel.length > 0;
    switch (c.k) {
      case "undo": {
        const v = this.history.undo();
        if (!v) return false;
        this.canvas = v;
        this.pruneSelection();
        this.o.onChange?.(v, true);
        return true;
      }
      case "redo": {
        const v = this.history.redo();
        if (!v) return false;
        this.canvas = v;
        this.pruneSelection();
        this.o.onChange?.(v, true);
        return true;
      }
      case "delete":
      case "cut":
        if (!has) return false;
        if (c.k === "cut")
          clipboard = this.selected.map(
            (b) => JSON.parse(JSON.stringify(b)) as SlideBlock,
          );
        this.apply(
          removeBlocks(
            this.canvas,
            sel.filter((id) => !blockById(this.canvas, id)?.frame.locked),
          ),
        );
        return true;
      case "duplicate": {
        if (!has) return false;
        const r = duplicateBlocks(this.canvas, sel, this.grid);
        this.apply(r.canvas);
        this.setSelection(r.ids);
        return true;
      }
      case "copy":
        if (!has) return false;
        clipboard = this.selected.map(
          (b) => JSON.parse(JSON.stringify(b)) as SlideBlock,
        );
        return true;
      case "paste": {
        if (!clipboard.length) return false;
        // paste into this slide: same place when it is free, else one grid cell down-right (like duplicate)
        const tmp: SlideCanvas = {
          ...this.canvas,
          blocks: [
            ...this.canvas.blocks,
            ...clipboard.map((b) => ({ ...b, id: `__clip_${b.id}` })),
          ],
        };
        const ids = clipboard.map((b) => `__clip_${b.id}`);
        const clash = clipboard.some((b) =>
          this.canvas.blocks.some(
            (x) => x.frame.x === b.frame.x && x.frame.y === b.frame.y,
          ),
        );
        const r = duplicateBlocks(tmp, ids, clash ? this.grid : 0);
        this.apply({
          ...r.canvas,
          blocks: r.canvas.blocks.filter((b) => !b.id.startsWith("__clip_")),
        });
        this.setSelection(r.ids);
        return true;
      }
      case "group": {
        if (sel.length < 2) return false;
        this.apply(groupBlocks(this.canvas, sel).canvas);
        return true;
      }
      case "ungroup":
        if (!this.selected.some((b) => b.frame.group)) return false;
        this.apply(ungroupBlocks(this.canvas, sel));
        return true;
      case "lock":
      case "unlock":
      case "toggleLock": {
        if (!has) return false;
        const lock =
          c.k === "lock"
            ? true
            : c.k === "unlock"
              ? false
              : !this.selected.every((b) => b.frame.locked);
        this.apply(setLocked(this.canvas, sel, lock));
        return true;
      }
      case "z":
        if (!has) return false;
        this.apply(reorder(this.canvas, sel, c.how));
        return true;
      case "align":
        if (!has) return false;
        this.apply(alignBlocks(this.canvas, sel, c.how));
        return true;
      case "distribute":
        if (sel.length < 3) return false;
        this.apply(distributeBlocks(this.canvas, sel, c.axis));
        return true;
      case "nudge": {
        if (!has) return false;
        const next = nudge(this.canvas, sel, c.dx, c.dy);
        if (next.blocks.every((b, i) => b === this.canvas.blocks[i]))
          return true;
        this.canvas = next;
        this.history.push(next, "nudge");
        this.o.onChange?.(next, true);
        return true;
      }
      case "selectAll":
        this.setSelection(
          this.canvas.blocks
            .filter((b) => !b.frame.locked && !b.hiddenInEditor)
            .map((b) => b.id),
        );
        return true;
      case "deselect":
        if (!has) return false;
        this.setSelection([]);
        return true;
      case "cycle": {
        const list = this.canvas.blocks.filter((b) => !b.hiddenInEditor);
        if (!list.length) return false;
        const i = has
          ? list.findIndex((b) => b.id === sel[sel.length - 1])
          : -1;
        const j = (i + c.dir + list.length) % list.length;
        this.setSelection([list[j].id]);
        return true;
      }
      case "edit":
        return (
          !!this.single() && ["text", "callout"].includes(this.single()!.kind)
        );
    }
  }
  private pruneSelection() {
    const ids = new Set(this.canvas.blocks.map((b) => b.id));
    this.setSelection(this.selection.filter((id) => ids.has(id)));
  }
}

/** The editor's keyboard map (pure): a key event → a command, or null (let the browser have it). */
export function keyCommand(
  e: {
    key: string;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
  },
  grid = DEFAULT_GRID,
): EditorCommand | null {
  const meta = !!(e.metaKey || e.ctrlKey);
  const shift = !!e.shiftKey;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const step = shift ? grid : 1;
  switch (k) {
    case "ArrowLeft":
      return { k: "nudge", dx: -step, dy: 0 };
    case "ArrowRight":
      return { k: "nudge", dx: step, dy: 0 };
    case "ArrowUp":
      return { k: "nudge", dx: 0, dy: -step };
    case "ArrowDown":
      return { k: "nudge", dx: 0, dy: step };
    case "Backspace":
    case "Delete":
      return { k: "delete" };
    case "Escape":
      return { k: "deselect" };
    case "Enter":
      return { k: "edit" };
    case "Tab":
      return { k: "cycle", dir: shift ? -1 : 1 };
  }
  if (meta) {
    switch (k) {
      case "z":
        return shift ? { k: "redo" } : { k: "undo" };
      case "y":
        return { k: "redo" };
      case "d":
        return { k: "duplicate" };
      case "g":
        return shift ? { k: "ungroup" } : { k: "group" };
      case "l":
        return { k: "toggleLock" };
      case "a":
        return { k: "selectAll" };
      case "c":
        return { k: "copy" };
      case "x":
        return { k: "cut" };
      case "v":
        return { k: "paste" };
      case "]":
        return { k: "z", how: "front" };
      case "[":
        return { k: "z", how: "back" };
    }
    return null;
  }
  if (k === "]") return { k: "z", how: "forward" };
  if (k === "[") return { k: "z", how: "backward" };
  return null;
}
