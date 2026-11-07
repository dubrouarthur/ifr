// Tolerance gauge of a standard tile: a track, the tolerance band, the zero tick and one marker per measured value.
import { h } from "../dom";
import type { Gauge } from "./types";

export function gauge(g: Gauge, failed: boolean, exceeded = false): HTMLElement {
  const span = g.max - g.min || 1;
  const pc = (v: number) => `${Math.max(0, Math.min(100, ((v - g.min) / span) * 100)).toFixed(2)}%`;
  const el = h("div", { class: "rs-gauge", "aria-hidden": "true" }, h("i", { class: "trk" }), h("i", { class: "tol", style: `left:${pc(g.lo)};width:calc(${pc(g.hi)} - ${pc(g.lo)})` }));
  if (g.zero !== undefined) el.append(h("i", { class: "zero", style: `left:${pc(g.zero)}` }));
  for (const v of g.v) {
    const out = v < g.lo || v > g.hi;
    el.append(h("i", { class: `mk${failed ? " bad" : out ? (exceeded ? " warn" : " bad") : ""}`, style: `left:${pc(v)}` }));
  }
  return el;
}
