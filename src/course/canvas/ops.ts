// Ground school — designed slides: editing operations as pure functions over a SlideCanvas (package N).
// Every function returns a NEW canvas (the input is never mutated), so the editor can push it on the history.
import type { BlockFrame, Pt, SlideBlock, SlideCanvas } from "../types";
import {
  aabb,
  arrowFrame,
  keepOnSlide,
  mapPoint,
  union,
  type Box,
  boxOf,
  SLIDE_W,
  SLIDE_H,
} from "./geom";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

let idSeq = 0;
/** A short block id unique within a slide (b + base36 time + counter). */
export function newBlockId(
  taken?: ReadonlySet<string> | readonly SlideBlock[],
  prefix = "b",
): string {
  const set =
    taken instanceof Set
      ? taken
      : new Set(
          (taken as readonly SlideBlock[] | undefined)?.map((b) => b.id) ?? [],
        );
  let id: string;
  do
    id = `${prefix}${(Date.now() % 1e8).toString(36)}${(idSeq++).toString(36)}`;
  while (set.has(id));
  return id;
}
export function newGroupId(): string {
  return `g${(Date.now() % 1e8).toString(36)}${(idSeq++).toString(36)}`;
}

export const blockById = (c: SlideCanvas, id: string): SlideBlock | undefined =>
  c.blocks.find((b) => b.id === id);
export const maxZ = (c: SlideCanvas): number =>
  c.blocks.reduce((m, b) => Math.max(m, b.frame.z ?? 0), 0);

/** The selection grown to whole groups (a tap on one member selects the group). */
export function expandGroups(c: SlideCanvas, ids: readonly string[]): string[] {
  const groups = new Set(
    ids
      .map((id) => blockById(c, id)?.frame.group)
      .filter((g): g is string => !!g),
  );
  const out = new Set(ids);
  for (const b of c.blocks)
    if (b.frame.group && groups.has(b.frame.group)) out.add(b.id);
  return c.blocks.filter((b) => out.has(b.id)).map((b) => b.id);
}
/** Bounds of a set of blocks (rotated frames included). */
export function selectionBox(
  c: SlideCanvas,
  ids: readonly string[],
): Box | null {
  return union(
    c.blocks.filter((b) => ids.includes(b.id)).map((b) => aabb(b.frame)),
  );
}

function map(
  c: SlideCanvas,
  ids: readonly string[],
  fn: (b: SlideBlock) => SlideBlock,
): SlideCanvas {
  const set = new Set(ids);
  return {
    ...c,
    blocks: c.blocks.map((b) => (set.has(b.id) ? fn(clone(b)) : b)),
  };
}

/** Move a block's geometry: its frame, and for arrows / callouts their endpoints and targets with it. */
export function translateBlock(
  b: SlideBlock,
  dx: number,
  dy: number,
): SlideBlock {
  const out = clone(b);
  out.frame = { ...out.frame, x: out.frame.x + dx, y: out.frame.y + dy };
  if (out.kind === "arrow") {
    out.from = [out.from[0] + dx, out.from[1] + dy];
    out.to = [out.to[0] + dx, out.to[1] + dy];
  }
  if (out.kind === "callout" && out.target)
    out.target = [out.target[0] + dx, out.target[1] + dy];
  return out;
}
/** Give a block a new frame; arrow endpoints and callout targets scale with it. */
export function reframeBlock(b: SlideBlock, f: BlockFrame): SlideBlock {
  const out = clone(b);
  const from = boxOf(b.frame);
  const to = boxOf(f);
  out.frame = { ...f };
  if (out.kind === "arrow") {
    out.from = mapPoint(out.from, from, to);
    out.to = mapPoint(out.to, from, to);
  }
  if (out.kind === "callout" && out.target) {
    // the leader end stays where it points (it usually targets another block), unless it was inside the box
    const t = out.target;
    const inside =
      t[0] >= from.x &&
      t[0] <= from.x + from.w &&
      t[1] >= from.y &&
      t[1] <= from.y + from.h;
    if (inside) out.target = mapPoint(t, from, to);
  }
  return out;
}
/** An arrow with new endpoints (its frame follows). */
export function setArrowEnds(b: SlideBlock, from: Pt, to: Pt): SlideBlock {
  if (b.kind !== "arrow") return b;
  return {
    ...clone(b),
    from,
    to,
    frame: {
      ...arrowFrame(from, to, b.frame.z),
      locked: b.frame.locked,
      group: b.frame.group,
    },
  };
}

export function moveBlocks(
  c: SlideCanvas,
  ids: readonly string[],
  dx: number,
  dy: number,
): SlideCanvas {
  if (!dx && !dy) return c;
  return map(c, ids, (b) => (b.frame.locked ? b : translateBlock(b, dx, dy)));
}
/** Arrow keys: 1 unit, Shift = one grid cell. Locked blocks stay. Blocks keep at least 48 units on the slide. */
export function nudge(
  c: SlideCanvas,
  ids: readonly string[],
  dx: number,
  dy: number,
): SlideCanvas {
  return map(c, ids, (b) => {
    if (b.frame.locked) return b;
    const moved = translateBlock(b, dx, dy);
    const kept = keepOnSlide(moved.frame);
    return kept === moved.frame
      ? moved
      : translateBlock(b, kept.x - b.frame.x, kept.y - b.frame.y);
  });
}

export function addBlock(c: SlideCanvas, b: SlideBlock): SlideCanvas {
  const ids = new Set(c.blocks.map((x) => x.id));
  const blk = clone(b);
  if (!blk.id || ids.has(blk.id)) blk.id = newBlockId(ids);
  blk.frame = { ...blk.frame, z: maxZ(c) + 1 };
  return { ...c, blocks: [...c.blocks, blk] };
}
export function removeBlocks(
  c: SlideCanvas,
  ids: readonly string[],
): SlideCanvas {
  const set = new Set(ids);
  return { ...c, blocks: c.blocks.filter((b) => !set.has(b.id)) };
}
export function updateBlock(
  c: SlideCanvas,
  id: string,
  patch: Partial<SlideBlock> | ((b: SlideBlock) => SlideBlock),
): SlideCanvas {
  return {
    ...c,
    blocks: c.blocks.map((b) =>
      b.id !== id
        ? b
        : typeof patch === "function"
          ? patch(clone(b))
          : ({ ...b, ...patch } as SlideBlock),
    ),
  };
}

/**
 * Duplicate blocks (Cmd+D): copies offset by one grid cell, on top, selected next. Groups among the copies get a
 * fresh group id; references between copied blocks (a reveal action, a YourTurn block) are remapped.
 */
export function duplicateBlocks(
  c: SlideCanvas,
  ids: readonly string[],
  offset = 24,
): { canvas: SlideCanvas; ids: string[] } {
  const taken = new Set(c.blocks.map((b) => b.id));
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  const src = c.blocks.filter((b) => ids.includes(b.id));
  for (const b of src) {
    const n = newBlockId(taken);
    taken.add(n);
    idMap.set(b.id, n);
  }
  let z = maxZ(c);
  const copies = [...src]
    .sort((a, b) => a.frame.z - b.frame.z)
    .map((b) => {
      const cp = translateBlock(b, offset, offset);
      cp.id = idMap.get(b.id)!;
      cp.frame.z = ++z;
      delete cp.frame.locked;
      if (cp.frame.group) {
        if (!groupMap.has(cp.frame.group))
          groupMap.set(cp.frame.group, newGroupId());
        cp.frame.group = groupMap.get(cp.frame.group);
      }
      if (cp.onTap && "block" in cp.onTap && idMap.has(cp.onTap.block))
        cp.onTap = { ...cp.onTap, block: idMap.get(cp.onTap.block)! };
      return cp;
    });
  return {
    canvas: { ...c, blocks: [...c.blocks, ...copies] },
    ids: copies.map((b) => b.id),
  };
}

export function groupBlocks(
  c: SlideCanvas,
  ids: readonly string[],
): { canvas: SlideCanvas; group: string | null } {
  if (ids.length < 2) return { canvas: c, group: null };
  const g = newGroupId();
  return {
    canvas: map(c, ids, (b) => ({ ...b, frame: { ...b.frame, group: g } })),
    group: g,
  };
}
export function ungroupBlocks(
  c: SlideCanvas,
  ids: readonly string[],
): SlideCanvas {
  return map(c, ids, (b) => {
    const f = { ...b.frame };
    delete f.group;
    return { ...b, frame: f };
  });
}
export function setLocked(
  c: SlideCanvas,
  ids: readonly string[],
  locked: boolean,
): SlideCanvas {
  return map(c, ids, (b) => {
    const f = { ...b.frame };
    if (locked) f.locked = true;
    else delete f.locked;
    return { ...b, frame: f };
  });
}

/** Renumber z as 1..n in paint order (keeps the file tidy after many reorders). */
export function normalizeZ(c: SlideCanvas): SlideCanvas {
  const order = c.blocks
    .map((b, i) => ({ b, i }))
    .sort((p, q) => p.b.frame.z - q.b.frame.z || p.i - q.i);
  const z = new Map(order.map((p, k) => [p.b.id, k + 1]));
  return {
    ...c,
    blocks: c.blocks.map((b) =>
      b.frame.z === z.get(b.id)
        ? b
        : { ...b, frame: { ...b.frame, z: z.get(b.id)! } },
    ),
  };
}
export type ZMove = "front" | "back" | "forward" | "backward";
/** Bring to front / send to back / one step forward / one step backward (the selection keeps its own order). */
export function reorder(
  c: SlideCanvas,
  ids: readonly string[],
  how: ZMove,
): SlideCanvas {
  const n = normalizeZ(c);
  const order = [...n.blocks]
    .sort((a, b) => a.frame.z - b.frame.z)
    .map((b) => b.id);
  const sel = new Set(ids);
  let next: string[];
  if (how === "front")
    next = [
      ...order.filter((id) => !sel.has(id)),
      ...order.filter((id) => sel.has(id)),
    ];
  else if (how === "back")
    next = [
      ...order.filter((id) => sel.has(id)),
      ...order.filter((id) => !sel.has(id)),
    ];
  else {
    next = [...order];
    const step = how === "forward" ? 1 : -1;
    const idx = next
      .map((id, i) => (sel.has(id) ? i : -1))
      .filter((i) => i >= 0);
    if (step > 0) idx.reverse();
    for (const i of idx) {
      const j = i + step;
      if (j < 0 || j >= next.length || sel.has(next[j])) continue;
      [next[i], next[j]] = [next[j], next[i]];
    }
  }
  const z = new Map(next.map((id, k) => [id, k + 1]));
  return {
    ...n,
    blocks: n.blocks.map((b) => ({
      ...b,
      frame: { ...b.frame, z: z.get(b.id)! },
    })),
  };
}

export type Align = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
/** Align blocks to each other (2+), or to the slide (1). */
export function alignBlocks(
  c: SlideCanvas,
  ids: readonly string[],
  how: Align,
): SlideCanvas {
  const sel = c.blocks.filter((b) => ids.includes(b.id) && !b.frame.locked);
  if (!sel.length) return c;
  const ref: Box =
    sel.length === 1
      ? { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H }
      : union(sel.map((b) => aabb(b.frame)))!;
  let out = c;
  for (const b of sel) {
    const bb = aabb(b.frame);
    let dx = 0;
    let dy = 0;
    if (how === "left") dx = ref.x - bb.x;
    if (how === "right") dx = ref.x + ref.w - (bb.x + bb.w);
    if (how === "hcenter") dx = ref.x + ref.w / 2 - (bb.x + bb.w / 2);
    if (how === "top") dy = ref.y - bb.y;
    if (how === "bottom") dy = ref.y + ref.h - (bb.y + bb.h);
    if (how === "vcenter") dy = ref.y + ref.h / 2 - (bb.y + bb.h / 2);
    out = moveBlocks(out, [b.id], Math.round(dx), Math.round(dy));
  }
  return out;
}
/** Distribute 3+ blocks with equal gaps, horizontally or vertically. */
export function distributeBlocks(
  c: SlideCanvas,
  ids: readonly string[],
  axis: "h" | "v",
): SlideCanvas {
  const sel = c.blocks.filter((b) => ids.includes(b.id) && !b.frame.locked);
  if (sel.length < 3) return c;
  const boxes = sel.map((b) => ({ b, bb: aabb(b.frame) }));
  const key = axis === "h" ? "x" : "y";
  const size = axis === "h" ? "w" : "h";
  boxes.sort((p, q) => p.bb[key] - q.bb[key]);
  const first = boxes[0].bb;
  const last = boxes[boxes.length - 1].bb;
  const total = boxes.reduce((s, p) => s + p.bb[size], 0);
  const gap =
    (last[key] + last[size] - first[key] - total) / (boxes.length - 1);
  let at = first[key];
  let out = c;
  for (const p of boxes) {
    const d = Math.round(at - p.bb[key]);
    out =
      axis === "h"
        ? moveBlocks(out, [p.b.id], d, 0)
        : moveBlocks(out, [p.b.id], 0, d);
    at += p.bb[size] + gap;
  }
  return out;
}

/** Scale a set of blocks about a box (multi-select resize): frames and arrow ends scale with it. */
export function scaleBlocks(
  c: SlideCanvas,
  ids: readonly string[],
  from: Box,
  to: Box,
): SlideCanvas {
  return map(c, ids, (b) => {
    if (b.frame.locked) return b;
    const [x0, y0] = mapPoint([b.frame.x, b.frame.y], from, to);
    const [x1, y1] = mapPoint(
      [b.frame.x + b.frame.w, b.frame.y + b.frame.h],
      from,
      to,
    );
    return reframeBlock(b, {
      ...b.frame,
      x: x0,
      y: y0,
      w: Math.max(8, x1 - x0),
      h: Math.max(8, y1 - y0),
    });
  });
}

/** The default reveal order for the next "appear on click" block. */
export function nextRevealOrder(c: SlideCanvas): number {
  return c.blocks.reduce((m, b) => Math.max(m, b.reveal?.order ?? 0), 0) + 1;
}
/** Reveal steps on a slide (sorted distinct orders). */
export function revealSteps(c: SlideCanvas): number[] {
  return [
    ...new Set(
      c.blocks
        .map((b) => b.reveal?.order)
        .filter((n): n is number => typeof n === "number" && n > 0),
    ),
  ].sort((a, b) => a - b);
}
