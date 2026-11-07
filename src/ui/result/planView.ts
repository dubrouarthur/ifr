// Spatial view of the result: north up, the flown track (ink) over the published hold racetrack (magenta dashed, as
// on charts; nav/holding.ts racetrack(), 1-minute legs, AIM 5-3-8) or the procedure fixes, the numbered pins at
// each finding's worst moment, a scale bar. Static SVG (also printable).
import { esc } from "../dom";
import { racetrack, type HoldDef } from "../../nav/holding";
import { mmss, num, rt, curLang } from "./i18n";
import type { ResultInput, ResultReport } from "./types";

const VW = 320;
const VH = 210;

export function planViewSvg(
  inp: ResultInput,
  rep: ResultReport,
): string | null {
  const L = curLang();
  const tr = inp.trace;
  if (tr.length < 4) return null;
  const hold = inp.hold;
  const fixes = hold ? [hold.fix] : (inp.fixes ?? []);
  if (!hold && !fixes.length) return null;
  const lat0 = tr.reduce((a, p) => a + p.lat, 0) / tr.length;
  const lon0 = tr.reduce((a, p) => a + p.lon, 0) / tr.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const P = (p: { lat: number; lon: number }) => ({
    x: (p.lon - lon0) * 60 * k,
    y: (p.lat - lat0) * 60,
  });
  const track = tr.map(P);
  const race = hold
    ? racetrack(
        {
          fix: hold.fix,
          inbound: hold.inbound,
          turn: hold.turn,
          legMin: hold.legMin,
          altFt: hold.altFt,
        } as HoldDef,
        90,
      ).map(P)
    : [];
  // fixes near the flight only (a procedure lists fixes far away too)
  const tb = bounds(track);
  const near = fixes
    .map((f) => ({ f, p: P(f) }))
    .filter(
      ({ p }) =>
        p.x > tb.x0 - 4 &&
        p.x < tb.x1 + 4 &&
        p.y > tb.y0 - 4 &&
        p.y < tb.y1 + 4,
    );
  const b = bounds([...track, ...race, ...near.map((n) => n.p)]);
  const pad = 22;
  const sc = Math.min(
    (VW - pad * 2) / Math.max(0.5, b.x1 - b.x0),
    (VH - pad * 2) / Math.max(0.5, b.y1 - b.y0),
  );
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const S = (p: { x: number; y: number }) => ({
    x: VW / 2 + (p.x - cx) * sc,
    y: VH / 2 - (p.y - cy) * sc,
  });
  const path = (pts: { x: number; y: number }[], close = false) =>
    pts
      .map(
        (p, i) => `${i ? "L" : "M"}${S(p).x.toFixed(1)} ${S(p).y.toFixed(1)}`,
      )
      .join("") + (close ? "Z" : "");
  let g = `<rect width="${VW}" height="${VH}" class="pv-bg"/>`;
  if (race.length) g += `<path d="${path(race, true)}" class="pv-hold"/>`;
  g += `<path d="${path(track)}" class="pv-trk"/>`;
  for (const { f, p } of near) {
    const s = S(p);
    g += `<path d="M${s.x.toFixed(1)} ${(s.y - 5).toFixed(1)}l4.5 8h-9z" class="pv-fix"/><text x="${(s.x + 7).toFixed(1)}" y="${(s.y + 13).toFixed(1)}" class="pv-fix-t">${esc(f.ident)}</text>`;
  }
  const s0 = S(track[0]);
  g += `<circle cx="${s0.x.toFixed(1)}" cy="${s0.y.toFixed(1)}" r="3.5" class="pv-start"/>`;
  const e = S(track[track.length - 1]);
  // ended before the fix: what was still to fly, direct to the fix
  if (rep.outcome === "ungraded" && hold && hold.crossedAt === null) {
    const f = S(P(hold.fix));
    g += `<path d="M${e.x.toFixed(1)} ${e.y.toFixed(1)}L${f.x.toFixed(1)} ${f.y.toFixed(1)}" class="pv-todo"/>`;
  }
  if (rep.outcome === "ungraded") {
    g += `<circle cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r="5" class="pv-end"/>`;
    const right = e.x < VW - 90;
    g += `<text x="${(e.x + (right ? 9 : -9)).toFixed(1)}" y="${(e.y + 4).toFixed(1)}" text-anchor="${right ? "start" : "end"}" class="pv-end-t">${esc(rt("pv.ended", { t: mmss(rep.flown.sec) }))}</text>`;
  }
  // pins at the worst moment of each finding
  for (const f of rep.findings) {
    const p = tr.reduce(
      (a, q) => (Math.abs(q.t - f.tWorst) < Math.abs(a.t - f.tWorst) ? q : a),
      tr[0],
    );
    const s = S(P(p));
    g += `<g class="pv-pin ${f.group === "watch" ? "warn" : "bad"}"><circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="8"/><text x="${s.x.toFixed(1)}" y="${(s.y + 3.6).toFixed(1)}" text-anchor="middle">${f.n}</text></g>`;
  }
  // north arrow and scale bar
  g += `<path d="M18 12l5 12l-5-3l-5 3z" class="pv-n"/><text x="18" y="35" text-anchor="middle" class="pv-n-t">N</text>`;
  const nm = [0.25, 0.5, 1, 2, 5, 10].find((v) => v * sc >= 44) ?? 10;
  // the scale bar goes in the bottom corner the track leaves empty
  const scr = track.map(S);
  const crowd = (x: number) => scr.filter((q) => Math.abs(q.x - x) < 70 && q.y > VH - 50).length;
  const bx = crowd(50) <= crowd(VW - 50) ? 14 : VW - 14 - nm * sc - 34;
  const by = VH - 12;
  g += `<path d="M${bx} ${by - 4}v4h${(nm * sc).toFixed(1)}v-4" class="pv-scale"/><text x="${(bx + nm * sc + 6).toFixed(1)}" y="${by + 1}" class="pv-scale-t">${num(L, nm, nm < 1 ? (nm === 0.25 ? 2 : 1) : 0)} NM</text>`;
  const aria = rt("pv.aria", {
    hold: hold ? rt("pv.ariaHold", { fix: hold.fix.ident }) : "",
  });
  return `<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="${esc(aria)}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}

function bounds(pts: { x: number; y: number }[]) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1 };
}
