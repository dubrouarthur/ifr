// "Your flight": phases, the governing trace (altitude) against its band and the target, numbered findings, events
// and help, over a time axis. Drawn as SVG at the host's real pixel width (text never stretches) and redrawn when
// the host resizes. Colours come from the theme tokens through CSS classes (ui-result.css).
import { esc } from "../dom";
import { mmss, num, rt, curLang } from "./i18n";
import type { ResultReport, TimelineMark } from "./types";

export interface TimelineOpts {
  /** a finding pin was tapped */
  onPin?: (n: number) => void;
  touch?: boolean;
}

const RELATED_ALT = new Set(["alt", "stepdown", "constraint"]);

export function mountTimeline(
  host: HTMLElement,
  rep: ResultReport,
  opts: TimelineOpts = {},
): () => void {
  const draw = () => {
    const w = host.clientWidth;
    if (w < 40) return;
    host.innerHTML = timelineSvg(w, rep, opts);
  };
  draw();
  const ro = new ResizeObserver(() => draw());
  ro.observe(host);
  const click = (e: Event) => {
    const g = (e.target as Element).closest?.("[data-pin]");
    if (g) opts.onPin?.(Number(g.getAttribute("data-pin")));
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const g = (e.target as Element).closest?.("[data-pin]");
    if (g) {
      e.preventDefault();
      opts.onPin?.(Number(g.getAttribute("data-pin")));
    }
  };
  host.addEventListener("click", click);
  host.addEventListener("keydown", key);
  return () => {
    ro.disconnect();
    host.removeEventListener("click", click);
    host.removeEventListener("keydown", key);
  };
}

const f1 = (v: number) => v.toFixed(1);

export function timelineSvg(
  W: number,
  rep: ResultReport,
  opts: TimelineOpts = {},
): string {
  const L = curLang();
  const narrow = W < 640;
  const LG = narrow ? 58 : 78;
  const RG = 12;
  const T = Math.max(1, rep.timelineSec);
  const X = (t: number) =>
    LG + (Math.max(0, Math.min(T, t)) / T) * (W - LG - RG);
  const phH = 20;
  const prH = narrow ? 60 : 70;
  const lnH = opts.touch ? 30 : 22;
  const flownEnd = rep.flown.sec;
  const ungraded = rep.outcome === "ungraded";
  const lanes: { key: string; label: string; marks: TimelineMark[] }[] = [];
  if (rep.marks.findings.length)
    lanes.push({
      key: "f",
      label: rep.findings.every((f) => f.group === "watch")
        ? rt("tl.toWatch")
        : rt("tl.findings"),
      marks: rep.marks.findings,
    });
  if (rep.marks.events.length)
    lanes.push({ key: "e", label: rt("tl.events"), marks: rep.marks.events });
  if (rep.marks.help.length)
    lanes.push({ key: "h", label: rt("tl.help"), marks: rep.marks.help });
  const py0 = phH + 6;
  const ly0 = py0 + prH + 8;
  const H = ly0 + lanes.length * lnH + 22;
  let g = "";
  g += `<defs><pattern id="rs-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-ln"/></pattern></defs>`;
  // ---- phases (the exercise's steps)
  rep.phases.forEach((p, i) => {
    const x0 = X(p.t0);
    const wpx = Math.max(0, X(p.t1) - x0 - 1);
    g += `<rect x="${f1(x0)}" y="0" width="${f1(wpx)}" height="${phH}" rx="3" class="${p.ghost ? "ph ghost" : i % 2 ? "ph odd" : "ph"}"/>`;
    if (wpx > 34) {
      const max = Math.floor((wpx - 12) / 6.2);
      const lbl =
        p.label.length > max
          ? `${p.label.slice(0, Math.max(1, max - 1)).trimEnd()}…`
          : p.label;
      g += `<text x="${f1(x0 + 7)}" y="14" class="ph-t${p.ghost ? " ghost" : ""}">${esc(lbl)}</text>`;
    }
  });
  g += `<text x="0" y="14" class="lane-l">${esc(rt("tl.phase"))}</text>`;
  // ---- altitude trace
  const tr = rep.trace;
  const [a0, a1] = tr.range;
  const Y = (a: number) =>
    py0 + prH - ((Math.max(a0, Math.min(a1, a)) - a0) / (a1 - a0 || 1)) * prH;
  g += `<rect x="${LG}" y="${py0}" width="${W - LG - RG}" height="${prH}" class="pr-bg"/>`;
  const step = (a1 - a0) / 3;
  const nice =
    [50, 100, 200, 250, 500, 1000, 2000].find((s) => s >= step * 0.8) ?? 1000;
  for (let v = Math.ceil(a0 / nice) * nice; v <= a1; v += nice) {
    if (v === a0 || v === a1) continue;
    g += `<line x1="${LG}" x2="${W - RG}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" class="grid"/>`;
    g += `<text x="${LG - 6}" y="${f1(Y(v) + 3.5)}" class="tick" text-anchor="end">${num(L, v)}</text>`;
  }
  g += `<text x="0" y="${py0 + 12}" class="lane-l">${esc(rt("tl.alt"))}</text><text x="0" y="${py0 + 25}" class="unit">ft</text>`;
  const xEnd = X(flownEnd);
  if (tr.band)
    g += `<rect x="${LG}" y="${f1(Y(tr.band[1]))}" width="${f1(Math.max(0, xEnd - LG))}" height="${f1(Y(tr.band[0]) - Y(tr.band[1]))}" class="band"/>`;
  if (tr.ideal !== undefined)
    g += `<line x1="${LG}" x2="${f1(ungraded ? W - RG : xEnd)}" y1="${f1(Y(tr.ideal))}" y2="${f1(Y(tr.ideal))}" class="ideal"/>`;
  const pts = tr.points.filter((p) => p.t <= flownEnd + 0.5);
  if (pts.length > 1)
    g += `<path d="${pts.map((p, i) => `${i ? "L" : "M"}${f1(X(p.t))} ${f1(Y(p.v))}`).join("")}" class="trace"/>`;
  // deviation runs of the altitude findings
  const altF = rep.findings.filter((f) => RELATED_ALT.has(f.skill));
  // the crash's final dive is drawn as a deviation too
  const runsF = [...altF, ...rep.findings.filter((f) => f.standardId === "acs.crash")];
  for (const f of runsF) {
    const run = pts.filter((p) => p.t >= f.t0 && p.t <= f.t1);
    if (run.length > 1)
      g += `<path d="${run.map((p, i) => `${i ? "L" : "M"}${f1(X(p.t))} ${f1(Y(p.v))}`).join("")}" class="run ${f.group === "watch" ? "warn" : "bad"}"/>`;
  }
  const top = altF[0];
  if (top) {
    const p = pts.reduce(
      (a, b) =>
        Math.abs(b.t - top.tWorst) < Math.abs(a.t - top.tWorst) ? b : a,
      pts[0],
    );
    if (p) {
      const x = X(p.t);
      const right = x < W - 120;
      g += `<text x="${f1(right ? x + 8 : x - 8)}" y="${f1(Math.min(py0 + prH - 4, Math.max(py0 + 11, Y(p.v) + (p.v < (tr.ideal ?? p.v) ? 14 : -6))))}" text-anchor="${right ? "start" : "end"}" class="note ${top.group === "watch" ? "warn" : "bad"}">${num(L, top.value ?? Math.round(p.v))} ft</text>`;
    }
  }
  if (ungraded && flownEnd < T) {
    g += `<rect x="${f1(xEnd)}" y="${py0}" width="${f1(X(T) - xEnd)}" height="${prH}" fill="url(#rs-hatch)" class="nf"/>`;
    g += `<text x="${f1((xEnd + X(T)) / 2)}" y="${py0 + prH / 2 + 4}" text-anchor="middle" class="nf-t">${esc(rt("tl.notFlown"))}</text>`;
  }
  // ---- lanes
  lanes.forEach((ln, li) => {
    const y = ly0 + li * lnH + lnH / 2;
    g += `<text x="0" y="${f1(y + 4)}" class="lane-l">${esc(ln.label)}</text>`;
    g += `<line x1="${LG}" x2="${W - RG}" y1="${f1(y)}" y2="${f1(y)}" class="lane-ln"/>`;
    let freeX = -Infinity;
    for (const m of ln.marks) {
      const x = X(m.t);
      if (ln.key === "f") {
        const x1 = Math.max(x + 8, X(m.t1 ?? m.t));
        const hit = opts.touch ? 22 : 13;
        g += `<g class="pin ${m.kind}" data-pin="${m.n}" role="button" tabindex="0" aria-label="${esc(`${m.n}: ${m.label}`)}">`;
        g += `<rect x="${f1(x - hit)}" y="${f1(y - hit)}" width="${f1(x1 - x + hit * 2)}" height="${hit * 2}" class="hit"/>`;
        g += `<rect x="${f1(x)}" y="${f1(y - 3)}" width="${f1(x1 - x)}" height="6" rx="2" class="bar"/>`;
        g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="8" class="dot"/><text x="${f1(x)}" y="${f1(y + 3.6)}" text-anchor="middle" class="pin-t">${m.n}</text></g>`;
      } else {
        g +=
          ln.key === "h"
            ? `<path d="M${f1(x)} ${f1(y - 4.5)}l4.5 4.5l-4.5 4.5l-4.5-4.5z" class="dia"/>`
            : `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.6" class="ev ${m.kind}"/>`;
        const lbl = m.label.length > 34 ? `${m.label.slice(0, 33)}…` : m.label;
        const tw = lbl.length * 5.9 + 10;
        if (x + 7 > freeX && x + 7 + tw < W - RG + 4) {
          g += `<text x="${f1(x + 7)}" y="${f1(y + 3.8)}" class="ev-t"><title>${esc(m.label)}</title>${esc(lbl)}</text>`;
          freeX = x + 7 + tw;
        } else if (x - 7 - tw > freeX && x + 7 + tw >= W - RG + 4) {
          g += `<text x="${f1(x - 7)}" y="${f1(y + 3.8)}" text-anchor="end" class="ev-t">${esc(lbl)}</text>`;
          freeX = x + 6;
        }
      }
    }
  });
  // ---- time axis
  const ay = ly0 + lanes.length * lnH + 14;
  const tickEvery =
    [30, 60, 120, 300, 600, 900].find((s) => (T / s) * 58 <= W - LG - RG) ??
    1200;
  for (let t = 0; t <= T + 0.1; t += tickEvery) {
    const x = X(t);
    const anchor = x > W - RG - 14 ? "end" : x < LG + 14 && t > 0 ? "start" : "middle";
    g += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${ay - 12}" y2="${ay - 8}" class="grid"/>`;
    g += `<text x="${f1(anchor === "end" ? Math.min(x + 4, W - 1) : x)}" y="${ay + 2}" text-anchor="${anchor}" class="tick">${mmss(t)}</text>`;
  }
  const aria = rt("tl.aria", { n: rep.findings.length });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(aria)}">${g}</svg>`;
}
