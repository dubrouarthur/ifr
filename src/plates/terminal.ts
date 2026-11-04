// SID and STAR charts (SVG, 600 × 900 like the approach charts), Jeppesen 10-3 / 10-2 style: heading with the
// procedure name ('SSTIK FIVE DEPARTURE (RNAV)'), communications row, briefing strip, a NOT TO SCALE plan view
// (log-radial projection centred on the airport: bearings from the field are true, distances compressed, so the
// runway area and 100 NM transitions both stay legible) with every transition, fix constraints and the course
// (and distance) of every leg, then the route description text and the lost-communications note.
import { airport, NAVAIDS } from "../nav/data";
import { servesRunway } from "../nav/terminal";
import {
  bearingDeg,
  distanceNm,
  destination,
  toLocal,
  DEG,
  type LatLon,
} from "../nav/geo";
import type { Fix, TermLeg, TerminalProc } from "../nav/types";
import {
  W,
  H,
  FONT,
  INK,
  MUTED,
  P,
  pad3,
  freq,
  distTxt,
  text,
  rich,
  rect,
  line,
  textW,
  segsW,
  altSegs,
  arrowHead,
  courseLine,
  legLabel,
  navSymbol,
  navBox,
  symKindOf,
  beginLayout,
  Placer,
  kit,
  type Pt,
  type Seg,
  type Box,
  chartMargins,
} from "./plates";

const NUM = [
  "ZERO",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
];
const EFF = "05 NOV 26";

/** RNAV unless a navaid fix or a conventional leg type (vectors, radials, DME, intercepts) is used */
export function isRnav(p: TerminalProc): boolean {
  const legs = [
    ...p.rwy.flatMap((t) => t.legs),
    ...p.common,
    ...p.enr.flatMap((t) => t.legs),
  ];
  const fixes = legs.filter((l) => l.fix);
  if (fixes.length < 2) return false;
  if (fixes.some((l) => l.fix!.kind === "vor" || l.fix!.kind === "ndb"))
    return false;
  return !legs.some(
    (l) => l.vec && ["VM", "VI", "VR", "VD", "CI"].includes(l.vec.pt),
  );
}
/** 'SSTIK5' → 'SSTIK FIVE DEPARTURE (RNAV)' */
export function procTitle(p: TerminalProc): string {
  const m = /^([A-Z]+?)(\d)([A-Z]?)$/.exec(p.id);
  const name = m
    ? `${m[1]} ${NUM[Number(m[2])]}${m[3] ? ` ${m[3]}` : ""}`
    : p.id;
  return `${name} ${p.kind === "SID" ? "DEPARTURE" : "ARRIVAL"}${isRnav(p) ? " (RNAV)" : ""}`;
}
/** 'RW28B' → '28L/R', 'RW01L' → '01L', 'ALL' → 'ALL' */
export function rwyName(n: string): string {
  if (!n || n === "ALL") return "ALL";
  const r = n.replace(/^RW/, "");
  return /B$/.test(r) ? `${r.slice(0, -1)}L/R` : r;
}
const constraintText = (l: TermLeg) => {
  let s = "";
  if (l.altMin && l.altMax && l.altMin === l.altMax) s = ` at ${l.altMin}'`;
  else if (l.altMin && l.altMax) s = ` between ${l.altMin}' and ${l.altMax}'`;
  else if (l.altMin) s = ` at or above ${l.altMin}'`;
  else if (l.altMax) s = ` at or below ${l.altMax}'`;
  if (l.speed) s += ` (max ${l.speed} KT)`;
  return s;
};

/** the route of a leg sequence in words (Jeppesen route description) */
function describe(legs: TermLeg[], startFix: Fix | null, fromRunway = false): string {
  const parts: string[] = [];
  let prev: Fix | null = startFix;
  let vectors = false;
  for (const l of legs) {
    if (l.vec) {
      const c = l.vec.course !== null ? `${pad3(l.vec.course)}°` : "";
      const alt = l.altMin ? ` to ${l.altMin}'` : "";
      const spd = l.speed ? ` (max ${l.speed} KT)` : "";
      const what =
        l.vec.pt === "VM"
          ? `fly heading ${c} for radar vectors`
          : l.vec.pt === "VI"
            ? `fly heading ${c} to intercept`
            : l.vec.pt === "CI"
              ? `fly course ${c} to intercept`
              : l.vec.pt === "CA" || l.vec.pt === "CF"
                ? `climb on course ${c}${alt}`
                : l.vec.pt === "VR"
                  ? `fly heading ${c} to intercept the radial`
                  : l.vec.pt === "VD"
                    ? `fly heading ${c} to the DME fix`
                    : `climb heading ${c}${alt}`;
      parts.push(what + spd);
      vectors = l.vec.pt === "VM";
      prev = null;
      continue;
    }
    const f = l.fix!;
    if (prev && prev.ident === f.ident) continue;
    let s: string;
    if (vectors) s = `expect vectors to ${f.ident}`;
    else if (!parts.length && !prev) s = fromRunway ? `climb direct ${f.ident}` : `from ${f.ident}`;
    else if (!prev) s = `direct ${f.ident}`;
    else s = `on track ${pad3(bearingDeg(prev, f))}° to ${f.ident}`;
    s += constraintText(l);
    if (l.hold)
      s += `, hold (${l.hold.turn === "R" ? "right" : "left"} turns, ${pad3(l.hold.inbound)}° inbound, ${l.hold.legMin} min legs)`;
    parts.push(s);
    vectors = false;
    prev = f;
  }
  const t = parts.join(", then ");
  return t ? t[0].toUpperCase() + t.slice(1) + "." : "";
}

interface TermProj {
  (p: LatLon): Pt;
  /** px per NM at a point (the projection compresses with distance from the airport) */
  scaleAt: (p: LatLon) => number;
}
/** log-radial projection centred on the airport: r' = ln(1 + r/k) */
function fisheye(
  center: LatLon,
  pts: LatLon[],
  box: Box,
  margin: number,
): TermProj {
  const rs = pts.map((p) => distanceNm(center, p)).sort((a, b) => a - b);
  const k = Math.max(
    2.5,
    Math.min(9, (rs[Math.floor(rs.length * 0.6)] ?? 10) / 5),
  );
  const tf = (p: LatLon) => {
    const l = toLocal(center, p);
    const r = Math.hypot(l.x, l.y);
    if (r < 1e-9) return { x: 0, y: 0 };
    const rr = Math.log1p(r / k);
    return { x: (l.x / r) * rr, y: (l.y / r) * rr };
  };
  const t = pts.map(tf);
  const minX = Math.min(0, ...t.map((p) => p.x)),
    maxX = Math.max(0, ...t.map((p) => p.x)),
    minY = Math.min(0, ...t.map((p) => p.y)),
    maxY = Math.max(0, ...t.map((p) => p.y));
  const S = Math.min(
    (box.w - 2 * margin) / Math.max(0.2, maxX - minX),
    (box.h - 2 * margin) / Math.max(0.2, maxY - minY),
  );
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const fn = ((p: LatLon) => {
    const q = tf(p);
    return {
      x: box.x + box.w / 2 + (q.x - cx) * S,
      y: box.y + box.h / 2 - (q.y - cy) * S,
    };
  }) as TermProj;
  fn.scaleAt = (p) => S / (k + distanceNm(center, p));
  return fn;
}

/** every full route of the procedure (runway transition × enroute transition), duplicates merged */
function routes(
  p: TerminalProc,
): { rw: string | null; enr: string | null; legs: TermLeg[] }[] {
  const rws = p.rwy.length ? p.rwy : [null];
  const enrs = p.enr.length ? p.enr : [null];
  const out: { rw: string | null; enr: string | null; legs: TermLeg[] }[] = [];
  for (const r of rws)
    for (const e of enrs) {
      const parts =
        p.kind === "SID"
          ? [r?.legs ?? [], p.common, e?.legs ?? []]
          : [e?.legs ?? [], p.common, r?.legs ?? []];
      const legs: TermLeg[] = [];
      for (const l of parts.flat()) {
        const last = legs[legs.length - 1];
        if (l.fix && last?.fix?.ident === l.fix.ident) {
          legs[legs.length - 1] = {
            ...last,
            ...l,
            altMin: l.altMin ?? last.altMin,
            altMax: l.altMax ?? last.altMax,
            speed: l.speed ?? last.speed,
          };
          continue;
        }
        legs.push(l);
      }
      out.push({ rw: r?.name ?? null, enr: e?.name ?? null, legs });
    }
  return out;
}

export function sidChart(p: TerminalProc): string {
  return terminalChart(p);
}
export function starChart(p: TerminalProc): string {
  return terminalChart(p);
}

function terminalChart(p: TerminalProc): string {
  const apt = airport(p.airport);
  const sid = p.kind === "SID";
  const rnav = isRnav(p);
  const uid = `${p.airport}${p.kind}${p.id}`.replace(/[^a-z0-9]/gi, "");
  beginLayout(`${p.airport}-${p.kind}-${p.id}`);
  const o: string[] = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
  o.push(
    `<style>.p-${uid} text{font-family:${FONT};fill:${INK}} .p-${uid} .hl{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}</style>`,
  );
  o.push(`<g class="p-${uid}">`);
  o.push(rect(10, 10, W - 20, H - 20, { sw: 1.6 }));
  const title = procTitle(p);
  // ---------------------------------------------- heading
  o.push(text(20, 30, apt.icao, { size: 17, weight: 700, halo: false }));
  o.push(
    text(20 + textW(apt.icao, 17, true) + 10, 30, `Apt Elev ${apt.elevFt}'`, {
      size: 9.5,
      halo: false,
    }),
  );
  o.push(
    text(20, 47, apt.name.toUpperCase(), {
      size: 9.5,
      weight: 700,
      halo: false,
    }),
  );
  o.push(
    text(W - 20, 24, `${sid ? "10-3" : "10-2"}   ·   Eff ${EFF}`, {
      size: 8.5,
      anchor: "end",
      halo: false,
    }),
  );
  const tSize = textW(title, 17, true) > 360 ? 14 : 17;
  o.push(
    text(W - 20, 46, title, {
      size: tSize,
      weight: 700,
      anchor: "end",
      halo: false,
    }),
  );
  o.push(line({ x: 10, y: 56 }, { x: W - 10, y: 56 }, 1.2));
  // ---------------------------------------------- communications
  const fq = apt.freqs;
  const fac = (apt.city || apt.name).replace(/\s*\(.*$/, "").toUpperCase().split(/[,/]/)[0].trim();
  const comms: [string, number | undefined][] = sid
    ? [
        ["ATIS", fq.atis],
        ["Clearance / Ground", fq.ground],
        [fq.tower ? "Tower" : "CTAF", fq.tower ?? fq.ctaf],
        [`${fac} Departure`, fq.approach],
      ]
    : [
        ["ATIS", fq.atis],
        [`${fac} Approach`, fq.approach],
        [fq.tower ? "Tower" : "CTAF", fq.tower ?? fq.ctaf],
      ];
  const cm = comms.filter((c) => c[1]);
  const ccw = (W - 20) / Math.max(1, cm.length);
  cm.forEach((c, i) => {
    if (i) o.push(line({ x: 10 + i * ccw, y: 56 }, { x: 10 + i * ccw, y: 76 }));
    o.push(text(16 + i * ccw, 70, c[0], { size: 8.5, halo: false }));
    o.push(
      text(10 + (i + 1) * ccw - 6, 70.5, freq(c[1]), {
        size: 11,
        weight: 700,
        anchor: "end",
        halo: false,
      }),
    );
  });
  o.push(line({ x: 10, y: 76 }, { x: W - 10, y: 76 }));
  // ---------------------------------------------- briefing strip
  const rwys = p.rwy.map((t) => rwyName(t.name)).filter((x) => x !== "ALL");
  const allLegs = [
    ...p.rwy.flatMap((t) => t.legs),
    ...p.common,
    ...p.enr.flatMap((t) => t.legs),
  ];
  const speeds = allLegs.filter((l) => l.speed).map((l) => l.speed!);
  const tops = allLegs.filter((l) => l.altMax).map((l) => l.altMax!);
  const cells: [string, string][] = [
    [sid ? "SID" : "STAR", `${p.id}${rnav ? "  RNAV" : ""}`],
    ["Runways", rwys.length ? rwys.join(", ") : "ALL"],
    [
      sid ? "Top altitude" : "Highest constraint",
      sid
        ? tops.length
          ? `${Math.max(...tops)}'`
          : "ATC"
        : tops.length
          ? `${Math.max(...tops)}'`
          : "—",
    ],
    ["Speed", speeds.length ? `MAX ${Math.max(...speeds)} KT` : "—"],
    ["Trans alt", `18000'`],
  ];
  const cw = (W - 20) / cells.length;
  cells.forEach((c, i) => {
    const x = 10 + i * cw;
    if (i) o.push(line({ x, y: 76 }, { x, y: 110 }));
    o.push(text(x + 6, 87, c[0], { size: 8, halo: false }));
    const vs = textW(c[1], 13, true) > cw - 12 ? 10.5 : 13;
    o.push(text(x + 6, 104, c[1], { size: vs, weight: 700, halo: false }));
  });
  o.push(line({ x: 10, y: 110 }, { x: W - 10, y: 110 }));

  // ---------------------------------------------- route description (sized first: the plan view takes the rest)
  const desc: { head: string; body: string }[] = [];
  const fixOf = (t: TermLeg[]) => t.find((l) => l.fix)?.fix ?? null;
  if (sid) {
    for (const t of p.rwy)
      desc.push({
        head: `TAKEOFF RWY ${rwyName(t.name)}:`,
        body: describe(t.legs, null, true),
      });
    if (p.common.length) {
      const startFix = p.rwy.length
        ? ([...p.rwy[0].legs].reverse().find((l) => l.fix)?.fix ?? null)
        : null;
      desc.push({
        head: p.rwy.length ? "ALL RUNWAYS:" : "DEPARTURE:",
        body: describe(p.common, startFix),
      });
    }
    for (const t of p.enr)
      desc.push({
        head: `${t.name} TRANSITION (${p.id}.${t.name}):`,
        body: describe(t.legs, null),
      });
    desc.push({
      head: "LOST COMMUNICATIONS:",
      body: "Squawk 7600. Fly the departure as published and climb to the altitude assigned in the clearance; climb to the filed altitude 10 minutes after departure. Simulated chart — not for navigation.",
    });
  } else {
    for (const t of p.enr)
      desc.push({
        head: `${t.name} TRANSITION (${p.id}.${t.name}):`,
        body: describe(t.legs, null),
      });
    if (p.common.length)
      desc.push({
        head: p.enr.length
          ? `${fixOf(p.common)?.ident ?? ""} TO END:`
          : "ARRIVAL:",
        body: describe(p.common, null),
      });
    for (const t of p.rwy)
      desc.push({
        head: `LANDING RWY ${rwyName(t.name)}:`,
        body:
          describe(t.legs, null) ||
          "Expect radar vectors to the final approach course.",
      });
    if (!p.rwy.length) {
      const lastFix = [...allLegs].reverse().find((l) => l.fix)?.fix;
      const endsVectors = allLegs[allLegs.length - 1]?.vec?.pt === "VM";
      if (lastFix && !endsVectors) desc.push({ head: "EXPECT:", body: `Radar vectors or the published instrument approach after ${lastFix.ident}.` });
    }
    desc.push({
      head: "LOST COMMUNICATIONS:",
      body: "Squawk 7600. Continue the arrival as published and fly the approach per the clearance limit. Simulated chart — not for navigation.",
    });
  }
  const FS = 8.5,
    LH = 10.6;
  const wrapPara = (head: string, body: string, width: number): Seg[][] => {
    const lines: Seg[][] = [[{ t: head, b: true }]];
    let cur = lines[0];
    let curW = textW(head, FS, true);
    for (const w of body.split(" ")) {
      const ww = textW(" " + w, FS);
      if (curW + ww > width && cur.length) {
        cur = [];
        lines.push(cur);
        curW = 0;
        cur.push({ t: w });
        curW = textW(w, FS);
      } else {
        cur.push({ t: (curW ? " " : "") + w });
        curW += ww;
      }
    }
    return lines;
  };
  let cols = 1;
  let paras = desc.map((d) => wrapPara(d.head, d.body, W - 44));
  let nLines = paras.reduce((n, p0) => n + p0.length, 0) + paras.length * 0.35;
  if (nLines > 22) {
    cols = 2;
    paras = desc.map((d) => wrapPara(d.head, d.body, (W - 56) / 2));
    nLines = paras.reduce((n, p0) => n + p0.length, 0) + paras.length * 0.35;
  }
  const perCol = cols === 1 ? nLines : Math.ceil(nLines / 2) + 1;
  const maxTextH = 330;
  const textH = Math.min(maxTextH, 26 + perCol * LH);
  const tY = H - 32 - textH;
  const pv = { x: 10, y: 110, w: W - 20, h: tY - 110 };

  // ---------------------------------------------- plan view (not to scale)
  o.push(
    `<clipPath id="pv-${uid}"><rect x="${pv.x}" y="${pv.y}" width="${pv.w}" height="${pv.h}"/></clipPath>`,
  );
  o.push(`<g clip-path="url(#pv-${uid})">`);
  const rts = routes(p);
  const pts: LatLon[] = [
    apt,
    ...allLegs.filter((l) => l.fix).map((l) => l.fix!),
  ];
  for (const r of apt.runways) pts.push(r.threshold, r.end);
  for (const l of allLegs)
    if (l.fix && l.hold) pts.push(destination(l.fix, l.hold.inbound + 180, 6));
  // the projection is centred where the procedure is densest: the airport for a SID, the end of the arrival
  // route for a STAR that ends away from the field (the airport is then compressed like any far point)
  const endFix = sid
    ? null
    : ([...p.common].reverse().find((l) => l.fix)?.fix ?? [...(p.enr[0]?.legs ?? [])].reverse().find((l) => l.fix)?.fix ?? null);
  const focus: LatLon = endFix && distanceNm(endFix, apt) > 8 ? endFix : apt;
  // not to scale: on a STAR that ends far from the field, the airport glyph is drawn on its true bearing but
  // closer (never closer than the fixes that lie on the airport side), so the route fills the plan view
  let aptPos: LatLon = apt;
  if (focus !== apt) {
    const d = distanceNm(focus, apt);
    const nearest = Math.min(...allLegs.filter((l) => l.fix).map((l) => distanceNm(l.fix!, apt)));
    const dV = Math.max(10, d - nearest + 4);
    if (dV < d) {
      aptPos = destination(focus, bearingDeg(focus, apt), dV);
      pts.splice(0, pts.length, ...pts.filter((q) => q !== apt && !apt.runways.some((r) => r.threshold === q || r.end === q)), aptPos);
    }
  }
  const proj0 = fisheye(focus, pts, pv, 48);
  const proj = Object.assign((q: LatLon) => proj0(q === apt ? aptPos : q), { scaleAt: proj0.scaleAt }) as TermProj;
  const placer = new Placer(pv);
  placer.block(pv.x, pv.y, 40, 46); // north arrow
  placer.block(pv.x + pv.w - 116, pv.y + pv.h - 24, 116, 24); // NOT TO SCALE
  const geo: string[] = [];
  const later: (() => string)[] = [];
  // airport: a runway glyph (the longest runway 40 px), not to scale like the rest of the chart
  const cA = proj(apt);
  const maxLen = Math.max(0.5, ...apt.runways.map((r) => distanceNm(r.threshold, r.end)));
  const mini = (q: LatLon): Pt => {
    const l = toLocal(apt, q);
    return { x: cA.x + (l.x * 40) / maxLen, y: cA.y - (l.y * 40) / maxLen };
  };
  {
    for (let i = 0; i < apt.runways.length; i += 2) {
      const r = apt.runways[i];
      const q = kit.runwayQuad(mini(r.threshold), mini(r.end), 2.2);
      geo.push(
        `<polygon points="${q.map((v) => `${P(v.x)},${P(v.y)}`).join(" ")}" fill="${INK}"/>`,
      );
      placer.hardPoly(q);
    }
  }
  // runway departure ends of the runway transitions
  const depEnd = (name: string | null): LatLon | null => {
    const rws0 = apt.runways.filter(
      (r) => name && name !== "ALL" && servesRunway(name, r.id),
    );
    if (!rws0.length) return null;
    const ends = rws0.map((r) => r.end);
    return {
      lat: ends.reduce((s, e) => s + e.lat, 0) / ends.length,
      lon: ends.reduce((s, e) => s + e.lon, 0) / ends.length,
    };
  };
  const fixes = new Map<
    string,
    { fix: Fix; legs: TermLeg[]; trans: string[] }
  >();
  const segDone = new Set<string>();
  const holdDone = new Set<string>();
  const vecLen = 40;
  for (const rt of rts) {
    type Cur = { pt: Pt; ll: LatLon | null; ident: string; vectors: boolean };
    let cur: Cur | null = null;
    if (sid) {
      const de = depEnd(rt.rw);
      if (de)
        cur = { pt: mini(de), ll: de, ident: `RW${rt.rw}`, vectors: false };
    }
    rt.legs.forEach((l, li) => {
      if (l.vec) {
        const crs = l.vec.course ?? 0;
        const start: Cur = cur ?? {
          pt: proj(apt),
          ll: apt,
          ident: apt.icao,
          vectors: false,
        };
        const u = { x: Math.sin(crs * DEG), y: -Math.cos(crs * DEG) };
        const e = {
          x: start.pt.x + u.x * vecLen,
          y: start.pt.y + u.y * vecLen,
        };
        const key = `${start.ident}>V${crs}${l.vec.pt}`;
        if (!segDone.has(key)) {
          segDone.add(key);
          geo.push(
            line(start.pt, e, 1.3) + arrowHead(e, Math.atan2(u.y, u.x), 7),
          );
          placer.segment(start.pt, e);
          const segs: Seg[] = [
            {
              t: `${l.vec.pt === "CA" || l.vec.pt === "CF" || l.vec.pt === "CI" ? "" : "hdg "}${pad3(crs)}°`,
            },
            ...(l.altMin ? [{ t: "  " }, ...altSegs(l.altMin, l.altMax)] : []),
          ];
          later.push(() =>
            legLabel(start.pt, e, segs, placer, {
              size: 8.5,
              id: `${rt.rw ?? rt.enr ?? "route"}: ${key}`,
              minT: 1,
            }),
          );
          if (l.vec.pt === "VM") {
            later.push(() => {
              const tt = "RADAR VECTORS";
              const bx = placer.place(
                e.x,
                e.y,
                textW(tt, 8, true) + 4,
                10,
                5,
                tt,
                3,
              );
              return bx
                ? text(bx.x + 2, bx.y + 8, tt, { size: 8, weight: 700 })
                : "";
            });
          }
        }
        cur = {
          pt: e,
          ll: start.ll ? destination(start.ll, crs, 1.5) : null,
          ident: key,
          vectors: l.vec.pt === "VM",
        };
        return;
      }
      const f = l.fix!;
      const pp = proj(f);
      const rec = fixes.get(f.ident) ?? { fix: f, legs: [], trans: [] };
      rec.legs.push(l);
      const isEnd = sid ? li === rt.legs.length - 1 : li === 0;
      if (
        isEnd &&
        rt.enr &&
        rt.enr === f.ident &&
        !rec.trans.includes(`${p.id}.${rt.enr}`)
      )
        rec.trans.push(`${p.id}.${rt.enr}`);
      fixes.set(f.ident, rec);
      if (cur && !cur.vectors && cur.ident !== f.ident) {
        const key = `${cur.ident}>${f.ident}`;
        if (
          !segDone.has(key) &&
          Math.hypot(pp.x - cur.pt.x, pp.y - cur.pt.y) > 2
        ) {
          segDone.add(key);
          const a = cur.pt;
          geo.push(courseLine(a, pp, { width: 1.3 }));
          placer.segment(a, pp);
          const from = cur.ll;
          const fromFix =
            !cur.ident.includes(">") && !cur.ident.startsWith("RW");
          const segs: Seg[] = from
            ? [
                { t: `${pad3(bearingDeg(from, f))}°` },
                ...(fromFix
                  ? [{ t: ` (${distTxt(distanceNm(from, f))})`, b: false }]
                  : []),
              ]
            : [{ t: "direct" }];
          later.push(() =>
            legLabel(a, pp, segs, placer, {
              size: 8.5,
              id: `${rt.rw ?? ""}${rt.enr ? `.${rt.enr}` : ""}: ${key}`,
            }),
          );
        }
      }
      if (l.hold && !holdDone.has(f.ident)) {
        holdDone.add(f.ident);
        geo.push(
          kit.holdPattern(
            pp,
            l.hold.inbound,
            l.hold.turn,
            l.hold.legMin,
            proj.scaleAt(f) * 1.6,
            placer,
            { id: `hold ${f.ident}`, later },
          ),
        );
      }
      cur = { pt: pp, ll: f, ident: f.ident, vectors: false };
    });
  }
  // fix symbols block their spot
  for (const { fix: f } of fixes.values()) {
    const pp = proj(f);
    if (f.kind === "vor" || f.kind === "ndb") placer.circle(pp, 10);
    else placer.block(pp.x - 7, pp.y - 7, 14, 14);
  }
  o.push(...geo);
  for (const { fix: f } of fixes.values()) {
    const pp = proj(f);
    o.push(navSymbol(symKindOf(f, rnav), pp.x, pp.y));
  }
  // airport name near the field
  {
    const c = proj(apt);
    const tt = apt.icao;
    placer.circle(c, 4);
    later.unshift(() => {
      const bx = placer.place(c.x, c.y, textW(tt, 10, true) + 4, 12, 14, tt, 3);
      return bx ? text(bx.x + 2, bx.y + 10, tt, { size: 10, weight: 700 }) : "";
    });
  }
  // fix labels: name, constraints (underlined at or above, overlined at or below), speed, transition ident
  const labels: string[] = [];
  for (const { fix: f, legs, trans } of fixes.values()) {
    const pp = proj(f);
    const n = NAVAIDS.find((x) => x.ident === f.ident);
    const lc = legs.find((l) => l.altMin || l.altMax) ?? legs[0];
    const sp = legs.find((l) => l.speed)?.speed;
    if ((f.kind === "vor" || f.kind === "ndb") && n) {
      labels.push(navBox(n, pp, placer, trans[0] ? `(${trans[0]})` : ""));
      continue;
    }
    const lines: Seg[][] = [[{ t: f.ident, b: true, size: 10 }]];
    // a window (between two altitudes) is stacked: at or below on top, at or above below
    if (lc.altMin && lc.altMax && lc.altMin !== lc.altMax) lines.push(altSegs(undefined, lc.altMax, true), altSegs(lc.altMin, undefined, true));
    else {
      const al = altSegs(lc.altMin, lc.altMax, true);
      if (al.length) lines.push(al);
    }
    if (sp) lines.push([{ t: `MAX ${sp} KT` }]);
    for (const t of trans.slice(0, 1))
      lines.push([{ t: `(${t})`, b: false, size: 7.5 }]);
    const w =
      Math.max(...lines.map((s, i) => segsW(s, i ? 8.5 : 10, i === 0))) + 4;
    const h = 12 + (lines.length - 1) * 10;
    const bx = placer.place(pp.x, pp.y, w, h, 9, f.ident, 6, pp) ?? placer.place(pp.x, pp.y, w, h, 9, f.ident, 6, pp, false);
    if (!bx) continue;
    if (bx.lead) labels.push(line(bx.lead[0], bx.lead[1], 0.5));
    lines.forEach((s, i) =>
      labels.push(
        rich(bx.x + 2, bx.y + 10 + i * 10, s, {
          size: i ? 8.5 : 10,
          bold: i === 0,
        }),
      ),
    );
  }
  o.push(...labels);
  for (const f of later) o.push(f());
  o.push(`</g>`);
  // north arrow, NOT TO SCALE, frame
  o.push(
    `<g transform="translate(${pv.x + 20} ${pv.y + 28})"><path d="M0,-16 L5,4 L0,1 L-5,4 Z" fill="${INK}"/><text y="15" font-size="8" text-anchor="middle" font-weight="700">N</text></g>`,
  );
  o.push(
    `<rect x="${pv.x + pv.w - 110}" y="${pv.y + pv.h - 20}" width="104" height="15" fill="#fff" stroke="${INK}" stroke-width="0.8"/>`,
  );
  o.push(
    text(pv.x + pv.w - 58, pv.y + pv.h - 9, "NOT TO SCALE", {
      size: 8.5,
      weight: 700,
      anchor: "middle",
      halo: false,
    }),
  );
  o.push(rect(pv.x, pv.y, pv.w, pv.h, { sw: 1.2 }));

  // ---------------------------------------------- route description text
  o.push(
    text(
      20,
      tY + 14,
      sid ? "DEPARTURE ROUTE DESCRIPTION" : "ARRIVAL ROUTE DESCRIPTION",
      { size: 9, weight: 700, halo: false },
    ),
  );
  {
    const colW = cols === 1 ? W - 40 : (W - 50) / 2;
    const maxY = H - 38;
    let col = 0;
    let y = tY + 28;
    let clipped = 0;
    for (const para of paras) {
      if (y + para.length * LH > maxY + 2 && col < cols - 1) {
        col++;
        y = tY + 28;
      }
      for (const s of para) {
        if (y > maxY) {
          clipped++;
          continue;
        }
        o.push(rich(20 + col * (colW + 10), y, s, { size: FS, halo: false }));
        y += LH;
      }
      y += LH * 0.35;
    }
    if (clipped)
      o.push(
        text(W - 20, tY + 14, "(continued in the FMS route description)", {
          size: 7.5,
          anchor: "end",
          fill: MUTED,
          halo: false,
        }),
      );
    if (cols === 2)
      o.push(
        line(
          { x: 20 + colW + 5, y: tY + 22 },
          { x: 20 + colW + 5, y: maxY },
          0.5,
        ),
      );
  }
  // margins
  o.push(chartMargins(apt, procTitle(p), p.source));
  o.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plate">${o.join("")}</svg>`;
}
