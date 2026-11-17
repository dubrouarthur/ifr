// Teaching tools — a small chart frame shared by the tools (axes, ticks, gridlines) on the Svg builder.
import { lerpMap, type Svg, type ToolColors } from "./kit";

export interface Plot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  xr: [number, number];
  yr: [number, number];
  /** value → drawing coordinates */
  X(v: number): number;
  Y(v: number): number;
}
export function plot(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  xr: [number, number],
  yr: [number, number],
): Plot {
  return {
    x0,
    y0,
    x1,
    y1,
    xr,
    yr,
    X: (v) => lerpMap(v, xr[0], xr[1], x0, x1),
    Y: (v) => lerpMap(v, yr[0], yr[1], y1, y0),
  };
}
export interface AxisOpt {
  xTicks: number[];
  yTicks: number[];
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
  size?: number;
  /** draw the gridlines (default true) */
  grid?: boolean;
}
/** the frame: light gridlines on the ticks, the two axes, tick labels and the axis titles */
export function axes(s: Svg, p: Plot, c: ToolColors, o: AxisOpt): void {
  const fs = o.size ?? 22;
  if (o.grid !== false) {
    for (const v of o.xTicks) s.line(p.X(v), p.y0, p.X(v), p.y1, c.rule, 1.5);
    for (const v of o.yTicks) s.line(p.x0, p.Y(v), p.x1, p.Y(v), c.rule, 1.5);
  }
  s.line(p.x0, p.y1, p.x1, p.y1, c.ruleStrong, 2.5);
  s.line(p.x0, p.y0, p.x0, p.y1, c.ruleStrong, 2.5);
  for (const v of o.xTicks)
    s.text(p.X(v), p.y1 + fs + 6, (o.xFmt ?? String)(v), {
      size: fs,
      fill: c.muted,
      anchor: "middle",
    });
  for (const v of o.yTicks)
    s.text(p.x0 - 10, p.Y(v), (o.yFmt ?? String)(v), {
      size: fs,
      fill: c.muted,
      anchor: "end",
      mid: true,
    });
  if (o.xLabel)
    s.text(p.x1, p.y1 + 2 * fs + 14, o.xLabel, {
      size: fs,
      fill: c.muted,
      anchor: "end",
      weight: 600,
    });
  if (o.yLabel)
    s.text(p.x0, p.y0 - 16, o.yLabel, {
      size: fs,
      fill: c.muted,
      anchor: "start",
      weight: 600,
    });
}
