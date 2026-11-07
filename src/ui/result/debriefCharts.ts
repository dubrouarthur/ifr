// The debrief's three drawings (SPEC §2.4), as SVG strings drawn at the host's real pixel size, each with the
// mapping the playhead needs (the aircraft on the map, the profile cursor, the lanes' playhead), so scrubbing only
// moves a few elements instead of redrawing:
//   plan view  north up, the published procedure (magenta dashed, as on charts) or the hold racetrack (AIM 5-3-8,
//              1-minute legs below 14,000 ft), the flown track in ink, the deviation spans in red / amber, numbered
//              pins at each finding's worst moment, fixes with role and altitude, a scale bar
//   profile    altitude against the distance to the threshold (the plate's profile view: step-down minimums, the
//              glideslope with its ¾-scale cone — FAA-S-ACS-8C IR.VI.B, the DA / MDA line), or against time with the
//              exercise's target and ±100 ft band (IR.IV.A)
//   lanes      phase, a mini altitude trace, deviations · failures · procedure · help & cues · ATC, the time axis
// Colours are theme tokens through CSS classes (ui-result.css, debrief section).
import { esc } from "../dom";
import { racetrack, type HoldDef } from "../../nav/holding";
import { alongTrackNm, FT_PER_NM, type LatLon } from "../../nav/geo";
import { mmss, num } from "./i18n";
import { dx } from "./debriefStrings";
import { LANES, type DebriefModel, type LaneKey } from "./debriefData";
import type { Finding, HoldInput, Lang } from "./types";

const f1 = (v: number) => v.toFixed(1);

export interface TrackPt {
  t: number;
  lat: number;
  lon: number;
  alt: number;
}

export interface MapFix {
  ident: string;
  lat: number;
  lon: number;
  role?: string;
  alt?: number;
}

export interface MapGeom {
  fixes: MapFix[];
  /** published legs (procedure polylines) */
  paths: LatLon[][];
  hold?: HoldInput;
}

export interface Drawn {
  svg: string;
}
export interface MapDrawn extends Drawn {
  /** lat/lon → px (the aircraft marker) */
  P: (p: { lat: number; lon: number }) => [number, number];
}

/** the plan view; null with fewer than 4 points */
export function mapSvg(
  W: number,
  H: number,
  track: TrackPt[],
  geom: MapGeom,
  findings: Finding[],
  L: Lang,
): MapDrawn | null {
  if (track.length < 4 || W < 60 || H < 60) return null;
  const lat0 = track.reduce((a, p) => a + p.lat, 0) / track.length;
  const lon0 = track.reduce((a, p) => a + p.lon, 0) / track.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const N = (p: { lat: number; lon: number }) => ({
    x: (p.lon - lon0) * 60 * k,
    y: (p.lat - lat0) * 60,
  });
  const tr = track.map(N);
  const race = geom.hold
    ? racetrack(
        {
          fix: geom.hold.fix,
          inbound: geom.hold.inbound,
          turn: geom.hold.turn,
          legMin: geom.hold.legMin,
          altFt: geom.hold.altFt,
        } as HoldDef,
        90,
      ).map(N)
    : [];
  const b0 = bounds(tr);
  const near = (p: { x: number; y: number }, m = 3) =>
    p.x > b0.x0 - m && p.x < b0.x1 + m && p.y > b0.y0 - m && p.y < b0.y1 + m;
  // the fixes near the flight (a procedure lists fixes far away too); the hold fix always
  const fixes = geom.fixes
    .map((f) => ({ f, p: N(f) }))
    .filter(({ f, p }) => near(p, 4) || (geom.hold && f.ident === geom.hold.fix.ident));
  const paths = geom.paths
    .map((ps) => ps.map(N))
    .filter((ps) => ps.some((p) => near(p, 4)));
  const b = bounds([...tr, ...race, ...fixes.map((x) => x.p)]);
  const padL = 28;
  const padR = 28;
  const padT = 26;
  const padB = 34;
  const sc = Math.min(
    (W - padL - padR) / Math.max(0.6, b.x1 - b.x0),
    (H - padT - padB) / Math.max(0.6, b.y1 - b.y0),
  );
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const X = (x: number) => padL + (W - padL - padR) / 2 + (x - cx) * sc;
  const Y = (y: number) => padT + (H - padT - padB) / 2 - (y - cy) * sc;
  const P = (p: { lat: number; lon: number }): [number, number] => {
    const n = N(p);
    return [X(n.x), Y(n.y)];
  };
  const line = (ps: { x: number; y: number }[]) =>
    ps.map((p, i) => `${i ? "L" : "M"}${f1(X(p.x))} ${f1(Y(p.y))}`).join("");
  let g = `<rect width="${W}" height="${H}" class="m-bg"/>`;
  // a light 1 NM grid
  const gStep = sc * 1 < 18 ? 5 : 1;
  for (
    let x = Math.floor((cx - W / 2 / sc) / gStep) * gStep;
    X(x) < W;
    x += gStep
  )
    g += `<line x1="${f1(X(x))}" x2="${f1(X(x))}" y1="0" y2="${H}" class="m-grid"/>`;
  for (
    let y = Math.floor((cy - H / 2 / sc) / gStep) * gStep;
    Y(y) > 0;
    y += gStep
  )
    g += `<line y1="${f1(Y(y))}" y2="${f1(Y(y))}" x1="0" x2="${W}" class="m-grid"/>`;
  for (const ps of paths)
    if (ps.length > 1) g += `<path d="${line(ps)}" class="m-proc"/>`;
  if (race.length > 1) g += `<path d="${line(race)}Z" class="m-proc"/>`;
  // the flown track: a white halo, the ink line, the deviation spans on top
  const tl = line(tr);
  g += `<path d="${tl}" class="m-halo"/><path d="${tl}" class="m-trk"/>`;
  for (const f of findings) {
    const run = track.filter((p) => p.t >= f.t0 && p.t <= f.t1).map(N);
    if (run.length > 1)
      g += `<path d="${line(run)}" class="m-run ${f.group === "watch" ? "warn" : "bad"}"/>`;
  }
  // fixes: a triangle, the ident, the role and altitude
  let lastLbl: [number, number][] = [];
  for (const { f, p } of fixes) {
    const x = X(p.x);
    const y = Y(p.y);
    g += `<path d="M${f1(x)} ${f1(y - 5.5)}l5 8.5h-10z" class="m-fix"/>`;
    if (lastLbl.some(([a, c]) => Math.abs(a - x) < 60 && Math.abs(c - y) < 26))
      continue;
    lastLbl.push([x, y]);
    const sub = [f.role, f.alt ? num(L, f.alt) : null]
      .filter(Boolean)
      .join(" · ");
    g += `<text x="${f1(x)}" y="${f1(y + 18)}" text-anchor="middle" class="m-id">${esc(f.ident)}</text>`;
    if (sub)
      g += `<text x="${f1(x)}" y="${f1(y + 30)}" text-anchor="middle" class="m-sub">${esc(sub)}</text>`;
  }
  lastLbl = [];
  // start and end of the flown track
  const s0 = tr[0];
  const s1 = tr[tr.length - 1];
  g += `<circle cx="${f1(X(s0.x))}" cy="${f1(Y(s0.y))}" r="4" class="m-start"/>`;
  g += `<circle cx="${f1(X(s1.x))}" cy="${f1(Y(s1.y))}" r="4" class="m-end"/>`;
  // pins at the worst moment; a pin that would cover another one (or its label) moves along its stem
  const placed: [number, number][] = [];
  // drawn last, above the aircraft and its altitude tag: a pin stays visible and tappable when the tag passes it
  let pinsG = "";
  for (const f of findings) {
    const p = nearestT(track, f.tWorst);
    if (!p) continue;
    const [x, y] = P(p);
    const py = freeSpot(placed, x, y - 22 < 12 ? y + 22 : y - 22, y - 22 < 12 ? 22 : -22, 12, H - 12);
    placed.push([x, py]);
    pinsG += `<g class="pin ${f.group === "watch" ? "warn" : "bad"}" data-pin="${f.n}" role="button" tabindex="0" aria-label="${f.n}: ${esc(f.title)}"><line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x)}" y2="${f1(py)}" class="stem"/><circle cx="${f1(x)}" cy="${f1(py)}" r="12" class="hit"/><circle cx="${f1(x)}" cy="${f1(py)}" r="9" class="dot"/><text x="${f1(x)}" y="${f1(py + 3.8)}" text-anchor="middle" class="pin-t">${f.n}</text></g>`;
  }
  // north arrow and scale bar
  g += `<g class="m-north" transform="translate(16 14)"><path d="M0 12 L5 0 L10 12 L5 9 Z"/><text x="5" y="24" text-anchor="middle">${dx(L, "c.north")}</text></g>`;
  const nm = niceNm((W - padL - padR) / sc / 4);
  const bx = 16;
  const by = H - 14;
  g += `<g class="m-scale"><line x1="${bx}" x2="${f1(bx + nm * sc)}" y1="${by}" y2="${by}"/><line x1="${bx}" x2="${bx}" y1="${by - 4}" y2="${by}"/><line x1="${f1(bx + nm * sc)}" x2="${f1(bx + nm * sc)}" y1="${by - 4}" y2="${by}"/><text x="${f1(bx + nm * sc + 6)}" y="${by + 3.5}">${num(L, nm, nm < 1 ? 1 : 0)} NM</text></g>`;
  // the aircraft at the playhead (moved by the view) and its altitude tag
  g += `<g id="dbx-ac" class="m-ac"><circle r="11" class="ring"/><path d="M0 -8 L1.4 -2 L8 1.5 L8 3 L1.4 1.6 L1 6 L3.2 7.6 L3.2 8.6 L0 7.8 L-3.2 8.6 L-3.2 7.6 L-1 6 L-1.4 1.6 L-8 3 L-8 1.5 L-1.4 -2 Z" class="plane"/></g>`;
  g += `<g id="dbx-actag" class="m-tag"><rect rx="4" height="20"/><text y="14"></text></g>`;
  g += pinsG;
  const aria = dx(L, "c.mapAria", {
    proc: paths.length || race.length ? dx(L, "c.mapProc") : "",
    t: "{t}",
  });
  return {
    svg: `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${g}</svg>`,
    P,
  };
}

function niceNm(v: number): number {
  return [0.5, 1, 2, 5, 10, 20].find((s) => s >= v * 0.6) ?? 20;
}
function bounds(ps: { x: number; y: number }[]) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of ps) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1 };
}
/** a pin's y away from the pins already placed (22 px apart at least), stepping by `step` inside [lo, hi] */
function freeSpot(placed: [number, number][], x: number, y: number, step: number, lo: number, hi: number): number {
  const clash = (yy: number) => placed.some(([px, py]) => Math.hypot(px - x, py - yy) < 22);
  for (let k = 0; k < 4 && clash(y); k++) {
    const n = y + step;
    y = n < lo || n > hi ? y - step * (k + 2) : n;
    y = Math.max(lo, Math.min(hi, y));
  }
  return y;
}

export function nearestT<T extends { t: number }>(
  ps: T[],
  t: number,
): T | null {
  if (!ps.length) return null;
  let lo = 0;
  let hi = ps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ps[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const a = ps[Math.max(0, lo - 1)];
  const b = ps[lo];
  return Math.abs(a.t - t) < Math.abs(b.t - t) ? a : b;
}

// ---------------------------------------------------------------- profile

export interface PlateGeom {
  name: string;
  thr: LatLon;
  end: LatLon;
  elevFt: number;
  gsAngle?: number;
  tch?: number;
  /** final-segment fixes: distance to the threshold (NM), minimum altitude, role */
  legs: { ident: string; d: number; altMin?: number; role?: string }[];
  mins: number | null;
  minsKind: "DA" | "MDA";
}

export interface ProfileDrawn extends Drawn {
  /** the cursor x of a track point (null: off the chart) */
  xOf: (p: TrackPt) => number | null;
  yOf: (alt: number) => number;
}

export function profileSvg(
  W: number,
  H: number,
  mode: "dist" | "time",
  track: TrackPt[],
  durS: number,
  plate: PlateGeom | null,
  findings: Finding[],
  opt: { ideal?: number; band?: [number, number]; L: Lang },
): ProfileDrawn | null {
  if (track.length < 4 || W < 80 || H < 60) return null;
  const L = opt.L;
  const dist = mode === "dist" && plate;
  const LG = 50;
  const RG = 14;
  const T = 14;
  const B = 34;
  const dOf = (p: LatLon) =>
    plate ? -alongTrackNm(plate.thr, plate.end, p) : 0;
  let x0: number;
  let x1: number;
  const xs = track.map((p) => (dist ? dOf(p) : p.t / 60));
  if (dist) {
    const far = Math.max(
      4,
      ...plate.legs.map((l) => l.d).filter((d) => d < 30),
    );
    const flown = xs.filter((d) => d > -1 && d < 30);
    x0 = Math.ceil(
      Math.min(
        25,
        Math.max(far + 1, ...flown.slice(-Math.ceil(flown.length * 0.8))),
      ),
    );
    x1 = -0.5;
  } else {
    x0 = 0;
    x1 = Math.max(1, durS / 60);
  }
  const inX = (v: number) => (dist ? v <= x0 && v >= x1 : true);
  const vis = track.filter((_, i) => inX(xs[i]));
  const alts = (vis.length > 3 ? vis : track).map((p) => p.alt);
  const tops = [...alts];
  if (opt.ideal !== undefined) tops.push(opt.ideal + 200, opt.ideal - 200);
  if (plate)
    for (const l of plate.legs) if (l.altMin && l.d <= x0) tops.push(l.altMin);
  if (plate && dist) tops.push(plate.elevFt);
  const lo = Math.max(0, Math.floor((Math.min(...tops) - 150) / 500) * 500);
  const hi = Math.ceil((Math.max(...tops) + 200) / 500) * 500;
  const X = (v: number) => LG + ((v - x0) / (x1 - x0)) * (W - LG - RG);
  const Y = (a: number) => T + (1 - (a - lo) / (hi - lo || 1)) * (H - T - B);
  let g = `<rect x="${LG}" y="${T}" width="${W - LG - RG}" height="${H - T - B}" class="p-bg"/>`;
  const step = hi - lo > 5000 ? 2000 : hi - lo > 2400 ? 1000 : 500;
  for (let a = lo; a <= hi; a += step) {
    g += `<line x1="${LG}" x2="${W - RG}" y1="${f1(Y(a))}" y2="${f1(Y(a))}" class="grid"/>`;
    g += `<text x="${LG - 6}" y="${f1(Y(a) + 3.5)}" text-anchor="end" class="tick">${num(L, a)}</text>`;
  }
  // x axis
  const span = Math.abs(x0 - x1);
  const xstep = dist
    ? span > 16
      ? 4
      : span > 8
        ? 2
        : 1
    : ([1, 2, 5, 10, 15, 20, 30].find((s) => (span / s) * 60 <= W - LG - RG) ??
      30);
  for (
    let v = Math.ceil(Math.min(x0, x1) / xstep) * xstep;
    v <= Math.max(x0, x1) + 1e-6;
    v += xstep
  ) {
    if (dist && v < 0) continue;
    g += `<line x1="${f1(X(v))}" x2="${f1(X(v))}" y1="${H - B}" y2="${H - B + 4}" class="grid"/>`;
    g += `<text x="${f1(X(v))}" y="${H - B + 15}" text-anchor="middle" class="tick">${dist ? v : mmss(v * 60)}</text>`;
  }
  g += `<text x="${W - RG}" y="${H - 4}" text-anchor="end" class="tick ax">${esc(dist ? dx(L, "c.nmToThr") : dx(L, "c.time"))}</text>`;
  // the exercise's target and band (time view)
  if (!dist && opt.band)
    g += `<rect x="${LG}" y="${f1(Y(opt.band[1]))}" width="${W - LG - RG}" height="${f1(Math.max(1, Y(opt.band[0]) - Y(opt.band[1])))}" class="band"/>`;
  if (!dist && opt.ideal !== undefined)
    g += `<line x1="${LG}" x2="${W - RG}" y1="${f1(Y(opt.ideal))}" y2="${f1(Y(opt.ideal))}" class="ideal"/>`;
  if (dist && plate) {
    // glideslope / glidepath and its ¾-scale cone (± 0.75 × 0.7° full scale each side: 1.5 of 2 dots)
    if (plate.gsAngle) {
      const tch = plate.elevFt + (plate.tch ?? 50);
      const k = Math.tan((plate.gsAngle * Math.PI) / 180) * FT_PER_NM;
      const kHi =
        Math.tan(((plate.gsAngle + 0.525) * Math.PI) / 180) * FT_PER_NM;
      const kLo =
        Math.tan(((plate.gsAngle - 0.525) * Math.PI) / 180) * FT_PER_NM;
      const dTop = Math.min(x0, (hi - tch) / k);
      g += `<path d="M${f1(X(0))} ${f1(Y(tch))}L${f1(X(dTop))} ${f1(Y(tch + dTop * kHi))}L${f1(X(dTop))} ${f1(Y(tch + dTop * kLo))}Z" class="cone"/>`;
      g += `<line x1="${f1(X(0))}" y1="${f1(Y(tch))}" x2="${f1(X(dTop))}" y2="${f1(Y(tch + dTop * k))}" class="ideal"/>`;
    } else {
      // step-down altitudes of the final segment, with the floor hatched below them
      const st = plate.legs
        .filter((l) => l.altMin && l.d >= 0 && l.d <= x0)
        .sort((a, b) => b.d - a.d);
      let d = "";
      st.forEach((l, i) => {
        const nd = st[i + 1]?.d ?? 0;
        d += `${i ? "L" : "M"}${f1(X(l.d))} ${f1(Y(l.altMin!))}L${f1(X(nd))} ${f1(Y(l.altMin!))}`;
      });
      if (d) g += `<path d="${d}" class="ideal"/>`;
    }
    // step-down minimums of a non-precision approach, tinted below: a published segment minimum altitude is a floor
    // (14 CFR 91.175/91.177, AIM 5-4-5; ACS IR.VI.A: MDA +100/−0 ft), so it is drawn at the published altitude itself.
    // On a precision approach the glideslope governs once intercepted (AIM 5-4-5), so no segment floor is drawn.
    let floorLbl = false;
    for (const l of plate.gsAngle ? [] : plate.legs.filter(
      (x) => x.altMin && x.d <= x0,
    )) {
      const next = plate.legs
        .filter((q) => q.d < l.d)
        .sort((a, b) => b.d - a.d)[0];
      if (!next) continue;
      const floor = l.altMin!;
      const fw = Math.max(0, X(next.d) - X(l.d));
      g += `<rect x="${f1(X(l.d))}" y="${f1(Y(floor))}" width="${f1(fw)}" height="${f1(Math.max(0, Y(lo) - Y(floor)))}" class="floor"/><line x1="${f1(X(l.d))}" x2="${f1(X(next.d))}" y1="${f1(Y(floor))}" y2="${f1(Y(floor))}" class="floor-ln"/>`;
      if (!floorLbl && fw > 90 && Y(lo) - Y(floor) > 26) {
        floorLbl = true;
        g += `<text x="${f1(X(l.d) + 6)}" y="${f1(Y(floor) + 14)}" class="floor-t">${esc(dx(L, "c.lowest", { v: num(L, floor) }))}</text>`;
      }
    }
    for (const l of plate.legs) {
      if (l.d < 0.2 || l.d > x0) continue;
      const x = X(l.d);
      g += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${T}" y2="${H - B}" class="fixln"/>`;
      g += `<text x="${f1(x)}" y="${H - B + 26}" text-anchor="middle" class="fixt">${esc(l.ident)}${l.role === "FAF" ? " · FAF" : ""}</text>`;
    }
    if (plate.mins !== null && plate.mins > lo && plate.mins < hi) {
      g += `<line x1="${LG}" x2="${W - RG}" y1="${f1(Y(plate.mins))}" y2="${f1(Y(plate.mins))}" class="mins"/>`;
      g += `<text x="${LG + 6}" y="${f1(Y(plate.mins) - 4)}" class="mins-t">${esc(dx(L, plate.minsKind === "DA" ? "c.da" : "c.mda", { v: num(L, plate.mins) }))}</text>`;
    }
    g += `<rect x="${f1(X(0))}" y="${f1(Y(plate.elevFt) - 2)}" width="${f1(Math.max(5, X(-0.4) - X(0)))}" height="4" class="rwy"/>`;
  }
  // the flown trace, the deviation spans on top
  const segs: string[][] = [[]];
  track.forEach((p, i) => {
    if (!inX(xs[i])) {
      if (segs[segs.length - 1].length) segs.push([]);
      return;
    }
    segs[segs.length - 1].push(`${f1(X(xs[i]))} ${f1(Y(p.alt))}`);
  });
  for (const s of segs)
    if (s.length > 1) g += `<path d="M${s.join("L")}" class="trace"/>`;
  const pplaced: [number, number][] = [];
  for (const f of findings) {
    const run: string[] = [];
    track.forEach((p, i) => {
      if (p.t >= f.t0 && p.t <= f.t1 && inX(xs[i]))
        run.push(`${f1(X(xs[i]))} ${f1(Y(p.alt))}`);
    });
    if (run.length > 1)
      g += `<path d="M${run.join("L")}" class="run ${f.group === "watch" ? "warn" : "bad"}"/>`;
    const w = nearestT(track, f.tWorst);
    if (w) {
      const i = track.indexOf(w);
      if (inX(xs[i])) {
        const x = X(xs[i]);
        const y = freeSpot(pplaced, x, Math.min(H - B - 12, Y(w.alt) + 18), -22, T + 10, H - B - 12);
        pplaced.push([x, y]);
        g += `<g class="pin ${f.group === "watch" ? "warn" : "bad"}" data-pin="${f.n}" role="button" tabindex="0" aria-label="${f.n}: ${esc(f.title)}"><circle cx="${f1(x)}" cy="${f1(y)}" r="12" class="hit"/><circle cx="${f1(x)}" cy="${f1(y)}" r="9" class="dot"/><text x="${f1(x)}" y="${f1(y + 3.8)}" text-anchor="middle" class="pin-t">${f.n}</text></g>`;
      }
    }
  }
  g += `<g id="dbx-pcur" class="p-cur"><line y1="${T}" y2="${H - B}"/><circle r="5"/></g>`;
  const xOf = (p: TrackPt) => {
    const v = dist ? dOf(p) : p.t / 60;
    return inX(v) ? X(v) : null;
  };
  const aria = dx(L, "c.profAria", { n: findings.length, t: "{t}" });
  return {
    svg: `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${g}</svg>`,
    xOf,
    yOf: Y,
  };
}

// ---------------------------------------------------------------- lanes

export interface LanesDrawn extends Drawn {
  H: number;
  X: (t: number) => number;
  tOf: (x: number) => number;
  /** y range of the lane area (the playhead line) */
  y0: number;
  y1: number;
}

const LANE_KEY: Record<LaneKey, string> = {
  deviation: "l.deviation",
  failure: "l.failure",
  procedure: "l.procedure",
  help: "l.help",
  atc: "l.atc",
};

export function lanesSvg(
  W: number,
  m: DebriefModel,
  trace: { t: number; alt: number }[],
  show: Set<LaneKey>,
  touch: boolean,
): LanesDrawn {
  const L = m.lang;
  const narrow = W < 700;
  const LG = narrow ? 84 : 96;
  const RG = 16;
  const T = Math.max(1, m.durS);
  const X = (t: number) =>
    LG + (Math.max(0, Math.min(T, t)) / T) * (W - LG - RG);
  const tOf = (x: number) =>
    Math.max(0, Math.min(T, ((x - LG) / (W - LG - RG)) * T));
  const phH = 18;
  const trH = touch ? 32 : 40;
  const lnH = touch ? 22 : 20;
  const lanes = LANES.filter((k) => show.has(k));
  const py = phH + 6;
  const ly = py + trH + 8;
  const H = ly + lanes.length * lnH + 24;
  let g = "";
  // the whole area takes the scrub gesture
  g += `<rect x="0" y="0" width="${W}" height="${H}" class="scrub-hit"/>`;
  g += `<text x="0" y="13" class="lane-l">${esc(dx(L, "l.phase"))}</text>`;
  m.phases.forEach((p, i) => {
    const x0 = X(p.t0);
    const w = Math.max(0, X(p.t1) - x0 - 2);
    g += `<rect x="${f1(x0)}" y="0" width="${f1(w)}" height="${phH}" rx="3" class="ph${i % 2 ? " odd" : ""}"/>`;
    if (w > 40) {
      const max = Math.floor((w - 12) / 6.3);
      const lbl =
        p.label.length > max
          ? `${p.label.slice(0, Math.max(1, max - 1)).trimEnd()}…`
          : p.label;
      g += `<text x="${f1(x0 + 7)}" y="13" class="ph-t">${esc(lbl)}</text>`;
    }
  });
  // mini altitude trace
  g += `<text x="0" y="${py + 12}" class="lane-l">${esc(dx(L, "l.alt"))}</text>`;
  if (trace.length > 1) {
    const al = trace.map((p) => p.alt);
    let a0 = Math.min(...al);
    let a1 = Math.max(...al);
    if (m.ideal !== undefined) {
      a0 = Math.min(a0, m.ideal - 150);
      a1 = Math.max(a1, m.ideal + 150);
    }
    if (a1 - a0 < 300) {
      const c = (a0 + a1) / 2;
      a0 = c - 150;
      a1 = c + 150;
    }
    const Y = (a: number) => py + trH - ((a - a0) / (a1 - a0)) * trH;
    g += `<rect x="${LG}" y="${py}" width="${W - LG - RG}" height="${trH}" class="pr-bg"/>`;
    g += `<text x="${LG - 6}" y="${py + 9}" text-anchor="end" class="tick">${num(L, Math.round(a1 / 100) * 100)}</text>`;
    g += `<text x="${LG - 6}" y="${py + trH}" text-anchor="end" class="tick">${num(L, Math.round(a0 / 100) * 100)}</text>`;
    if (m.band)
      g += `<rect x="${LG}" y="${f1(Y(m.band[1]))}" width="${W - LG - RG}" height="${f1(Math.max(1, Y(m.band[0]) - Y(m.band[1])))}" class="band"/>`;
    if (m.ideal !== undefined)
      g += `<line x1="${LG}" x2="${W - RG}" y1="${f1(Y(m.ideal))}" y2="${f1(Y(m.ideal))}" class="ideal"/>`;
    const step = Math.max(
      1,
      Math.floor(trace.length / Math.max(60, W - LG - RG)),
    );
    const pts = trace.filter((_, i) => i % step === 0);
    g += `<path d="${pts.map((p, i) => `${i ? "L" : "M"}${f1(X(p.t))} ${f1(Y(p.alt))}`).join("")}" class="trace"/>`;
    for (const f of m.findings) {
      const run = trace.filter((p) => p.t >= f.t0 && p.t <= f.t1);
      if (run.length > 1)
        g += `<path d="${run.map((p, i) => `${i ? "L" : "M"}${f1(X(p.t))} ${f1(Y(p.alt))}`).join("")}" class="run ${f.group === "watch" ? "warn" : "bad"}"/>`;
    }
  }
  lanes.forEach((ln, li) => {
    const y = ly + li * lnH + lnH / 2;
    g += `<text x="0" y="${f1(y + 4)}" class="lane-l">${esc(dx(L, LANE_KEY[ln]))}</text>`;
    const items = m.lanes[ln];
    if (!items.length) {
      g += `<text x="${LG + 4}" y="${f1(y + 4)}" class="none">${esc(dx(L, "l.none"))}</text>`;
      return;
    }
    let freeX = -Infinity;
    items.forEach((it, k) => {
      const nextX = k + 1 < items.length ? X(items[k + 1].t) : Infinity;
      const x = X(it.t);
      if (ln === "deviation" && it.n !== undefined) {
        const x1 = Math.max(x + 10, X(it.t1 ?? it.t));
        const hit = touch ? 22 : 12;
        g += `<g class="pin ${it.kind === "warn" ? "warn" : "bad"}" data-pin="${it.n}" role="button" tabindex="0" aria-label="${esc(`${it.n}: ${it.label}`)}">`;
        g += `<rect x="${f1(x - hit)}" y="${f1(y - hit)}" width="${f1(x1 - x + hit * 2)}" height="${hit * 2}" class="hit"/>`;
        g += `<rect x="${f1(x)}" y="${f1(y - 3)}" width="${f1(x1 - x)}" height="6" rx="2" class="bar"/>`;
        g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="8" class="dot"/><text x="${f1(x)}" y="${f1(y + 3.6)}" text-anchor="middle" class="pin-t">${it.n}</text></g>`;
        return;
      }
      const mk =
        ln === "help"
          ? `<path d="M${f1(x)} ${f1(y - 5)}l5 5l-5 5l-5-5z" class="mk help"/>`
          : ln === "atc"
            ? `<rect x="${f1(x - 3.5)}" y="${f1(y - 3.5)}" width="7" height="7" class="mk atc"/>`
            : ln === "failure"
              ? `<path d="M${f1(x)} ${f1(y - 5)}l5 9h-10z" class="mk fail"/>`
              : `<circle cx="${f1(x)}" cy="${f1(y)}" r="4" class="mk proc ${it.kind}"/>`;
      g += `<g class="evg" data-t="${it.t.toFixed(2)}">${mk}`;
      const lbl = it.label.length > 30 ? `${it.label.slice(0, 29)}…` : it.label;
      const tw = lbl.length * 5.9 + 12;
      if (x + 8 > freeX && x + 8 + tw < W - RG + 6 && x + 8 + tw < nextX - 6) {
        g += `<text x="${f1(x + 8)}" y="${f1(y + 3.8)}" class="ev-t"><title>${esc(it.label)}</title>${esc(lbl)}</text>`;
        freeX = x + 8 + tw;
      } else g += `<title>${esc(`${mmss(it.t)} · ${it.label}`)}</title>`;
      g += `</g>`;
    });
  });
  // time axis
  const ay = ly + lanes.length * lnH + 16;
  const every =
    [15, 30, 60, 120, 300, 600, 900].find((s) => (T / s) * 64 <= W - LG - RG) ??
    1200;
  for (let t = 0; t <= T + 0.1; t += every) {
    const x = X(t);
    const anchor = x > W - RG - 16 ? "end" : "middle";
    g += `<text x="${f1(anchor === "end" ? W - 2 : x)}" y="${ay}" text-anchor="${anchor}" class="tick">${mmss(t)}</text>`;
  }
  g += `<g id="dbx-play" class="playhead"><line y1="0" y2="${ay - 10}"/><rect y="${ay - 11}" height="16" width="40" rx="4"/><text y="${ay + 1}" text-anchor="middle"></text></g>`;
  return {
    svg: `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`,
    H,
    X,
    tOf,
    y0: 0,
    y1: ay - 10,
  };
}
