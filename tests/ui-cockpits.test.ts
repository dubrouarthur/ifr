import { describe, expect, it } from "vitest";
import { Placer, routePolyline, vMax, vStall } from "../src/avionics/airliner";
import { AIRFRAME } from "../src/sim/aircraft";
import { EXPLAIN_REGIONS } from "../src/ui/explain";
import { destination, distanceNm } from "../src/nav/geo";
import type { Waypoint } from "../src/nav/flightplan";

describe("airliner speed tape limits", () => {
  it("stall speed goes from Vs1 clean to Vso with full flaps", () => {
    expect(vStall(0)).toBe(AIRFRAME.vs1);
    expect(vStall(30)).toBe(AIRFRAME.vso);
    expect(vStall(10)).toBeLessThan(AIRFRAME.vs1);
  });
  it("maximum speed barber pole drops to the flap placard with flaps out", () => {
    expect(vMax(0)).toBe(AIRFRAME.vne);
    expect(vMax(10)).toBe(AIRFRAME.vfe10);
    expect(vMax(30)).toBe(AIRFRAME.vfe);
  });
});

describe("ND route geometry", () => {
  const A = { lat: 45, lon: 5 };
  const wp = (
    ident: string,
    p: { lat: number; lon: number },
    extra: Partial<Waypoint> = {},
  ): Waypoint => ({ ident, lat: p.lat, lon: p.lon, ...extra });
  it("rounds a fly-by turn instead of drawing a corner", () => {
    const b = destination(A, 90, 10);
    const c = destination(b, 0, 10);
    const pts = routePolyline([wp("A", A), wp("B", b), wp("C", c)], 160);
    expect(pts.length).toBeGreaterThan(3);
    // the path never reaches the corner itself (turn anticipation)
    const closest = Math.min(...pts.map((p) => distanceNm(p, b)));
    expect(closest).toBeGreaterThan(0.1);
  });
  it("draws a DME arc leg on its radius", () => {
    const ctr = { ...A, ident: "CTR" };
    const s = destination(A, 180, 12);
    const e = destination(A, 270, 12);
    const pts = routePolyline(
      [wp("S", s), wp("E", e, { arc: { center: ctr, radius: 12, dir: "R" } })],
      120,
    );
    expect(pts.length).toBeGreaterThan(10);
    for (const p of pts) expect(distanceNm(p, A)).toBeCloseTo(12, 0);
  });
});

describe("ND label placer", () => {
  const ctx = {
    font: "",
    measureText: (s: string) => ({ width: s.length * 9 }),
  } as unknown as CanvasRenderingContext2D;
  it("never places two labels on top of each other", () => {
    const pl = new Placer();
    pl.reserve({ x: 0, y: 0, w: 100, h: 100 });
    const out = [
      pl.place(ctx, 300, 300, "MARLO", 16),
      pl.place(ctx, 302, 301, "KEDDY", 16),
      pl.place(ctx, 304, 300, "ARD", 16),
      pl.place(ctx, 20, 20, "HIDDEN", 16),
    ];
    expect(out[3]).toBeNull();
    const r = pl.rects.slice(1);
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i];
        const b = r[j];
        const overlap =
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y;
        expect(overlap).toBe(false);
      }
  });
});

describe("explain regions", () => {
  it("stay inside the 1024 × 768 screen", () => {
    for (const [name, regions] of Object.entries(EXPLAIN_REGIONS))
      for (const [x, y, w, h, title] of regions) {
        expect(x, `${name} ${title}`).toBeGreaterThanOrEqual(0);
        expect(y, `${name} ${title}`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${name} ${title}`).toBeLessThanOrEqual(1024);
        expect(y + h, `${name} ${title}`).toBeLessThanOrEqual(768);
      }
  });
});
