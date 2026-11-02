// Procedurally generated instrument approach plates (SVG) built from the nav database.
import { airport, navaid, NAVAIDS, runway, AIRPORTS, APPROACHES } from '../nav/data';
import { destination, distanceNm, toLocal, norm360, bearingDeg, type LatLon } from '../nav/geo';
import type { Approach, Fix, ProcLeg } from '../nav/types';

const W = 600;
const H = 900;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f2 = (n: number) => n.toFixed(2);
const pad3 = (n: number) => String(Math.round(norm360(n)) || 360).padStart(3, '0');
const freq = (f?: number) => (f ? f.toFixed(f * 1000 % 10 ? 3 : 2).replace(/0$/, '') : '—');

interface Proj {
  (p: LatLon): { x: number; y: number };
  scale: number; // px per nm
}

function makeProj(points: LatLon[], box: { x: number; y: number; w: number; h: number }, margin = 34): Proj {
  const ref = points[0];
  const loc = points.map((p) => toLocal(ref, p));
  const minX = Math.min(...loc.map((p) => p.x));
  const maxX = Math.max(...loc.map((p) => p.x));
  const minY = Math.min(...loc.map((p) => p.y));
  const maxY = Math.max(...loc.map((p) => p.y));
  const scale = Math.min((box.w - 2 * margin) / Math.max(1, maxX - minX), (box.h - 2 * margin) / Math.max(1, maxY - minY));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const fn = ((p: LatLon) => {
    const l = toLocal(ref, p);
    return { x: box.x + box.w / 2 + (l.x - cx) * scale, y: box.y + box.h / 2 - (l.y - cy) * scale };
  }) as Proj;
  fn.scale = scale;
  return fn;
}

function fixSymbol(f: Fix, x: number, y: number, role?: string): string {
  if (f.kind === 'vor') {
    const r = 8;
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return `${f2(x + r * Math.cos(a))},${f2(y + r * Math.sin(a))}`;
    }).join(' ');
    return `<polygon points="${pts}" fill="#fff" stroke="#000" stroke-width="1.4"/><rect x="${x - 10}" y="${y - 7}" width="20" height="14" fill="none" stroke="#000" stroke-width="1"/><circle cx="${x}" cy="${y}" r="1.6"/>`;
  }
  if (f.kind === 'ndb') {
    let dots = '';
    for (let ring = 1; ring <= 3; ring++)
      for (let i = 0; i < 8 + ring * 4; i++) {
        const a = (2 * Math.PI * i) / (8 + ring * 4);
        dots += `<circle cx="${f2(x + ring * 3.2 * Math.cos(a))}" cy="${f2(y + ring * 3.2 * Math.sin(a))}" r="0.7"/>`;
      }
    return dots + `<circle cx="${x}" cy="${y}" r="2.2"/>`;
  }
  if (f.kind === 'runway' || f.kind === 'airport') return '';
  // waypoint (RNAV star) vs fix (triangle)
  const fly = role === 'FAF' ? `<path d="M${x - 9},${y - 9} L${x + 9},${y + 9} M${x + 9},${y - 9} L${x - 9},${y + 9}" stroke="#000" stroke-width="1.6"/>` : '';
  return `<polygon points="${x},${y - 7} ${x - 6.5},${y + 5} ${x + 6.5},${y + 5}" fill="#fff" stroke="#000" stroke-width="1.5"/>${fly}`;
}

function arrowLine(a: { x: number; y: number }, b: { x: number; y: number }, opts: { width?: number; dash?: boolean; arrow?: boolean } = {}): string {
  const w = opts.width ?? 1.6;
  const dash = opts.dash ? ' stroke-dasharray="7 5"' : '';
  let s = `<line x1="${f2(a.x)}" y1="${f2(a.y)}" x2="${f2(b.x)}" y2="${f2(b.y)}" stroke="#000" stroke-width="${w}"${dash}/>`;
  if (opts.arrow !== false) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const mx = a.x + (b.x - a.x) * 0.55;
    const my = a.y + (b.y - a.y) * 0.55;
    const l = 9;
    s += `<polygon points="${f2(mx + l * Math.cos(ang))},${f2(my + l * Math.sin(ang))} ${f2(mx + l * 0.6 * Math.cos(ang + 2.4))},${f2(my + l * 0.6 * Math.sin(ang + 2.4))} ${f2(mx + l * 0.6 * Math.cos(ang - 2.4))},${f2(my + l * 0.6 * Math.sin(ang - 2.4))}"/>`;
  }
  return s;
}

function legLabel(a: { x: number; y: number }, b: { x: number; y: number }, text: string, side = 1): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  return `<text x="${f2(mx)}" y="${f2(my)}" transform="rotate(${f2(ang)} ${f2(mx)} ${f2(my)}) translate(0 ${side * -6})" text-anchor="middle" font-size="10.5" font-weight="700">${esc(text)}</text>`;
}

function holdPath(proj: Proj, fix: LatLon, inbound: number, turn: 'R' | 'L', dashed: boolean): string {
  const legNm = 1.6;
  const rNm = 0.55;
  const s = turn === 'R' ? 1 : -1;
  const p0 = proj(fix);
  const back = proj(destination(fix, inbound + 180, legNm));
  const side = proj(destination(fix, inbound + 90 * s, 2 * rNm));
  const sideBack = proj(destination(destination(fix, inbound + 90 * s, 2 * rNm), inbound + 180, legNm));
  const r = rNm * proj.scale;
  const sweep = turn === 'R' ? 1 : 0;
  const d = `M${f2(back.x)},${f2(back.y)} L${f2(p0.x)},${f2(p0.y)} A${f2(r)},${f2(r)} 0 0 ${sweep} ${f2(side.x)},${f2(side.y)} L${f2(sideBack.x)},${f2(sideBack.y)} A${f2(r)},${f2(r)} 0 0 ${sweep} ${f2(back.x)},${f2(back.y)}`;
  return `<path d="${d}" fill="none" stroke="#000" stroke-width="1.6"${dashed ? ' stroke-dasharray="7 5"' : ''}/>`;
}

function runwayShape(proj: Proj, icao: string, scaleUp = 1): string {
  const a = airport(icao);
  let out = '';
  for (let i = 0; i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const p1 = proj(r.threshold);
    const p2 = proj(r.end);
    const w = Math.max(3, (r.widthFt / 6076) * proj.scale * scaleUp);
    out += `<line x1="${f2(p1.x)}" y1="${f2(p1.y)}" x2="${f2(p2.x)}" y2="${f2(p2.y)}" stroke="#000" stroke-width="${f2(w)}" stroke-linecap="butt"/>`;
  }
  return out;
}

function altText(l: ProcLeg): string {
  return l.altMin ? `${l.altMin}` : '';
}

const PLAN_BOX = { x: 10, y: 172, w: W - 20, h: 370 };

function planPoints(ap: Approach): LatLon[] {
  const apt = airport(ap.airport);
  const nav = ap.navaid ? navaid(ap.navaid) : undefined;
  const allLegs: ProcLeg[] = [...ap.transitions.flatMap((t) => t.legs), ...ap.final, ...ap.missed];
  const pts: LatLon[] = [apt, ...allLegs.map((l) => l.fix)];
  if (nav && nav.type !== 'ILS') pts.push(nav);
  return pts;
}

/** Projection used by the plan view, so the UI can draw own-ship on the plate. */
export function planProjection(ap: Approach): { proj: (p: LatLon) => { x: number; y: number }; box: typeof PLAN_BOX } {
  return { proj: makeProj(planPoints(ap), PLAN_BOX, 46), box: PLAN_BOX };
}

export function approachPlate(ap: Approach): string {
  const apt = airport(ap.airport);
  const rwy = runway(ap.airport, ap.runway);
  const nav = ap.navaid ? navaid(ap.navaid) : undefined;
  const parts: string[] = [];
  const allLegs: ProcLeg[] = [...ap.transitions.flatMap((t) => t.legs), ...ap.final, ...ap.missed];
  const pts = planPoints(ap);

  parts.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  // ------------------------------------------------ header
  parts.push(`<g font-family="Arial, Helvetica, sans-serif" fill="#000">`);
  parts.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#000" stroke-width="1.5"/>`);
  parts.push(`<text x="20" y="28" font-size="10">${esc(apt.city)}</text>`);
  parts.push(`<text x="${W - 20}" y="28" font-size="10" text-anchor="end">${esc(apt.name)} (${apt.icao})</text>`);
  parts.push(`<text x="${W / 2}" y="30" font-size="17" font-weight="700" text-anchor="middle">${esc(ap.name)}</text>`);
  const navLine = nav ? `${nav.type === 'ILS' ? 'LOC/DME' : nav.type === 'NDB' ? 'NDB' : 'VOR/DME'} ${nav.name} ${nav.type === 'NDB' ? nav.freq : nav.freq.toFixed(2)}` : 'WAAS CH 51027  W27A';
  const boxY = 40;
  const cols = [
    [nav ? navLine : 'WAAS', ap.type === 'RNAV' ? 'GPS' : nav?.ident ?? ''],
    ['APP CRS', `${pad3(ap.crsSetting ?? ap.finalCourse)}°`],
    [`Rwy Idg ${rwy.lengthFt}`, `TDZE ${rwy.elevFt}`],
    [`Apt Elev ${apt.elevFt}`, ''],
  ];
  const cw = (W - 20) / cols.length;
  cols.forEach((c, i) => {
    parts.push(`<rect x="${10 + i * cw}" y="${boxY}" width="${cw}" height="38" fill="none" stroke="#000"/>`);
    parts.push(`<text x="${10 + i * cw + 6}" y="${boxY + 15}" font-size="10.5" font-weight="700">${esc(c[0])}</text>`);
    parts.push(`<text x="${10 + i * cw + 6}" y="${boxY + 31}" font-size="12" font-weight="700">${esc(c[1])}</text>`);
  });
  // notes + MSA
  const notesY = boxY + 38;
  parts.push(`<rect x="10" y="${notesY}" width="${W - 140}" height="58" fill="none" stroke="#000"/>`);
  ap.notes.forEach((n, i) => parts.push(`<text x="18" y="${notesY + 16 + i * 13}" font-size="10">${esc(n)}</text>`));
  if (ap.category === 'Non-precision' && ap.type !== 'NDB') parts.push(`<text x="18" y="${notesY + 16 + ap.notes.length * 13}" font-size="10">Procedure NA for arrivals on airways without radar.</text>`);
  // MSA circle
  const mx = W - 70;
  const my = notesY + 29;
  parts.push(`<rect x="${W - 130}" y="${notesY}" width="120" height="58" fill="none" stroke="#000"/>`);
  parts.push(`<circle cx="${mx}" cy="${my}" r="24" fill="none" stroke="#000"/>`);
  parts.push(`<text x="${mx}" y="${my + 4}" font-size="11" font-weight="700" text-anchor="middle">${ap.msa.alt}</text>`);
  parts.push(`<text x="${mx}" y="${my - 10}" font-size="7" text-anchor="middle">MSA ${esc(ap.msa.center)} 25 NM</text>`);
  // missed approach text + frequencies
  const freqY = notesY + 58;
  parts.push(`<rect x="10" y="${freqY}" width="${W - 20}" height="36" fill="none" stroke="#000"/>`);
  parts.push(`<text x="18" y="${freqY + 14}" font-size="9.5" font-weight="700">MISSED APPROACH:</text>`);
  parts.push(`<text x="110" y="${freqY + 14}" font-size="9.5">${esc(ap.missedText)}</text>`);
  const fq = apt.freqs;
  const fr = [
    ['ATIS', freq(fq.atis)],
    ['APP CON', freq(fq.approach)],
    [fq.tower ? 'TOWER' : 'CTAF', freq(fq.tower ?? fq.ctaf)],
    [fq.ground ? 'GND CON' : 'UNICOM', freq(fq.ground ?? fq.ctaf)],
  ];
  fr.forEach((f, i) => parts.push(`<text x="${18 + i * 140}" y="${freqY + 29}" font-size="10"><tspan font-weight="700">${f[0]}</tspan> ${f[1]}</text>`));

  // ------------------------------------------------ plan view
  const pv = { ...PLAN_BOX, y: freqY + 36 };
  parts.push(`<rect x="${pv.x}" y="${pv.y}" width="${pv.w}" height="${pv.h}" fill="none" stroke="#000"/>`);
  parts.push(`<clipPath id="pvclip"><rect x="${pv.x}" y="${pv.y}" width="${pv.w}" height="${pv.h}"/></clipPath><g clip-path="url(#pvclip)">`);
  const proj = makeProj(pts, pv, 46);

  // localizer feathers
  if (nav && (nav.type === 'ILS' || nav.type === 'LOC')) {
    const ant = proj(nav);
    const far = (offset: number) => proj(destination(nav, (nav.course ?? 0) + 180 + offset, 12));
    const back = (offset: number) => proj(destination(nav, (nav.course ?? 0) + offset, 4));
    parts.push(`<path d="M${f2(ant.x)},${f2(ant.y)} L${f2(far(2.5).x)},${f2(far(2.5).y)} L${f2(far(0).x)},${f2(far(0).y)} Z" fill="#000" opacity="0.85"/>`);
    parts.push(`<path d="M${f2(ant.x)},${f2(ant.y)} L${f2(far(-2.5).x)},${f2(far(-2.5).y)} L${f2(far(0).x)},${f2(far(0).y)} Z" fill="#fff" stroke="#000"/>`);
    if (ap.type === 'LOCBC') {
      parts.push(`<path d="M${f2(ant.x)},${f2(ant.y)} L${f2(back(2.5).x)},${f2(back(2.5).y)} L${f2(back(-2.5).x)},${f2(back(-2.5).y)} Z" fill="#fff" stroke="#000"/>`);
      parts.push(`<path d="M${f2(ant.x)},${f2(ant.y)} L${f2(back(2.5).x)},${f2(back(2.5).y)} L${f2(back(0).x)},${f2(back(0).y)} Z" fill="#000"/>`);
    }
    parts.push(`<text x="${f2(far(-3).x)}" y="${f2(far(-3).y + 14)}" font-size="10" font-weight="700" text-anchor="middle">${esc(nav.name)} ${nav.freq.toFixed(2)}</text>`);
  }
  // transitions
  for (const t of ap.transitions) {
    for (let i = 0; i < t.legs.length; i++) {
      const l = t.legs[i];
      if (l.pt) {
        // barbed procedure turn
        const o = l.pt.outbound;
        const s45 = o + (l.pt.side === 'L' ? -45 : 45);
        const p0 = proj(l.fix);
        const p1 = proj(destination(l.fix, o, 4.5));
        const b0 = destination(l.fix, o, 2.6);
        const b1 = proj(destination(b0, s45, 1.8));
        const bb = proj(b0);
        parts.push(`<line x1="${f2(p0.x)}" y1="${f2(p0.y)}" x2="${f2(p1.x)}" y2="${f2(p1.y)}" stroke="#000" stroke-width="1.6"/>`);
        parts.push(arrowLine(bb, b1, { width: 1.6 }));
        parts.push(arrowLine(b1, proj(destination(destination(b0, s45, 1.8), s45 + 180, 0.01)), { width: 1.6, arrow: false }));
        const back = proj(destination(destination(b0, s45, 1.8), o + 180 + (l.pt.side === 'L' ? 45 : -45), 1.2));
        parts.push(arrowLine(b1, back, { width: 1.6 }));
        parts.push(legLabel(bb, b1, `${pad3(s45)}°`));
        parts.push(legLabel(b1, back, `${pad3(s45 + 180)}°`, -1));
        parts.push(`<text x="${f2((p0.x + p1.x) / 2)}" y="${f2((p0.y + p1.y) / 2 + 26)}" font-size="9" text-anchor="middle" font-weight="700">PROCEDURE TURN — REMAIN WITHIN ${l.pt.withinNm} NM · ${l.altMin}</text>`);
      }
      if (l.hilpt && l.hold) parts.push(holdPath(proj, l.fix, l.hold.inbound, l.hold.turn, false));
      if (i === 0) continue;
      const a = proj(t.legs[i - 1].fix);
      const b = proj(l.fix);
      if (l.arc) {
        const c = NAVAIDS.find((n) => n.ident === l.arc!.center);
        if (c) {
          const r = l.arc.radius * proj.scale;
          // SVG y is flipped relative to bearings: CCW in bearing = sweep 0
          parts.push(`<path d="M${f2(a.x)},${f2(a.y)} A${f2(r)},${f2(r)} 0 0 ${l.arc.dir === 'R' ? 1 : 0} ${f2(b.x)},${f2(b.y)}" fill="none" stroke="#000" stroke-width="1.6"/>`);
          const mid = proj(destination(c, (bearingDeg(c, t.legs[i - 1].fix) + bearingDeg(c, l.fix)) / 2, l.arc.radius + 1.2));
          parts.push(`<text x="${f2(mid.x)}" y="${f2(mid.y)}" font-size="10" font-weight="700" text-anchor="middle">${l.arc.radius} DME ARC · ${l.altMin ?? ''}</text>`);
        }
        continue;
      }
      parts.push(arrowLine(a, b, { width: 1.4 }));
      parts.push(legLabel(a, b, `${l.altMin ?? ''} NoPT ${pad3(l.course ?? 0)}° (${(l.dist ?? 0).toFixed(1)})`));
    }
  }
  // final
  for (let i = 1; i < ap.final.length; i++) {
    const a = proj(ap.final[i - 1].fix);
    const b = proj(ap.final[i].fix);
    parts.push(arrowLine(a, b, { width: 3 }));
    if (i === 1) parts.push(legLabel(a, b, `${pad3(ap.finalCourse)}°  (${(ap.final[i].dist ?? 0).toFixed(1)})`));
  }
  // missed approach
  for (let i = 1; i < ap.missed.length; i++) {
    const a = proj(ap.missed[i - 1].fix);
    const b = proj(ap.missed[i].fix);
    parts.push(arrowLine(a, b, { dash: true }));
    const h = ap.missed[i].hold;
    if (h) parts.push(holdPath(proj, ap.missed[i].fix, h.inbound, h.turn, true));
  }
  // hold-in-lieu at final legs
  for (const l of ap.final) if (l.hold) parts.push(holdPath(proj, l.fix, l.hold.inbound, l.hold.turn, false));
  // runway
  parts.push(runwayShape(proj, ap.airport, 3));
  // navaids not on legs
  const shown = new Set<string>();
  for (const l of allLegs) {
    if (shown.has(l.fix.ident)) continue;
    shown.add(l.fix.ident);
    const p = proj(l.fix);
    parts.push(fixSymbol(l.fix, p.x, p.y, l.role));
    if (l.fix.kind === 'runway') continue;
    const role = l.role && l.role !== 'STEPDOWN' && l.role !== 'ENR' ? ` (${l.role === 'MAHP' ? 'MAHP' : l.role})` : '';
    const label = `${l.fix.ident}${role}`;
    parts.push(`<rect x="${f2(p.x + 10)}" y="${f2(p.y - 21)}" width="${label.length * 6.6 + 6}" height="14" fill="#fff"/>`);
    parts.push(`<text x="${f2(p.x + 13)}" y="${f2(p.y - 10)}" font-size="11" font-weight="700">${esc(label)}</text>`);
    if (l.fix.kind === 'vor' || l.fix.kind === 'ndb') {
      const n = NAVAIDS.find((x) => x.ident === l.fix.ident);
      if (n) parts.push(`<text x="${f2(p.x + 13)}" y="${f2(p.y + 18)}" font-size="9">${esc(n.name)} ${n.type === 'NDB' ? n.freq : n.freq.toFixed(2)}</text>`);
    }
    const alt = allLegs.filter((x) => x.fix.ident === l.fix.ident && x.altMin).map((x) => x.altMin)[0];
    if (alt && l.role !== 'MAHP') parts.push(`<text x="${f2(p.x + 13)}" y="${f2(p.y + (l.fix.kind === 'vor' ? 30 : 6))}" font-size="10" text-decoration="underline">${alt}</text>`);
  }
  if (nav && nav.type !== 'ILS' && !shown.has(nav.ident)) {
    const p = proj(nav);
    parts.push(fixSymbol({ ...nav, kind: nav.type === 'NDB' ? 'ndb' : 'vor' }, p.x, p.y));
  }
  parts.push(`</g>`);
  // north arrow + scale
  parts.push(`<g transform="translate(${pv.x + 28} ${pv.y + 34})"><path d="M0,-18 L6,4 L0,0 L-6,4 Z"/><text y="16" font-size="9" text-anchor="middle">N</text></g>`);
  const nm5 = 5 * proj.scale;
  parts.push(`<g transform="translate(${pv.x + pv.w - nm5 - 20} ${pv.y + pv.h - 14})"><line x2="${f2(nm5)}" stroke="#000" stroke-width="2"/><line y1="-4" y2="4" stroke="#000"/><line x1="${f2(nm5)}" x2="${f2(nm5)}" y1="-4" y2="4" stroke="#000"/><text x="${f2(nm5 / 2)}" y="-5" font-size="9" text-anchor="middle">5 NM</text></g>`);

  // ------------------------------------------------ profile view
  const prY = pv.y + pv.h;
  const prH = 150;
  parts.push(`<rect x="10" y="${prY}" width="${W - 20}" height="${prH}" fill="none" stroke="#000"/>`);
  const fin = ap.final;
  const dists = fin.map((l) => distanceNm(l.fix, rwy.threshold));
  const maxD = Math.max(...dists) * 1.08 + 0.5;
  const maxAlt = Math.max(...fin.map((l) => l.altMin ?? 0), rwy.elevFt + 1000) + 600;
  const px = (d: number) => W - 120 - (d / maxD) * (W - 190);
  const py = (alt: number) => prY + prH - 22 - ((alt - rwy.elevFt) / (maxAlt - rwy.elevFt)) * (prH - 46);
  parts.push(`<line x1="40" y1="${py(rwy.elevFt)}" x2="${W - 40}" y2="${py(rwy.elevFt)}" stroke="#000" stroke-width="1"/>`);
  // runway block
  parts.push(`<rect x="${px(0)}" y="${py(rwy.elevFt) - 3}" width="34" height="5" fill="#000"/>`);
  parts.push(`<text x="${px(0) + 17}" y="${py(rwy.elevFt) + 15}" font-size="9" text-anchor="middle">TDZE ${rwy.elevFt}</text>`);
  // descent path
  let pathD = '';
  const precision = !!ap.gsAngle;
  fin.forEach((l, i) => {
    const d = dists[i];
    const alt = l.role === 'MAP' ? (precision ? rwy.elevFt + (ap.tch ?? 50) : (ap.minimums[0].mda ?? rwy.elevFt)) : (l.altMin ?? 0);
    const x = px(d);
    const y = py(alt);
    if (i === 0) pathD += `M${f2(x)},${f2(y)}`;
    else if (!precision) {
      // non-precision: level then step down
      pathD += ` L${f2(x - 18)},${f2(py(fin[i - 1].altMin ?? alt))} L${f2(x)},${f2(y)}`;
    } else pathD += ` L${f2(x)},${f2(y)}`;
    parts.push(`<line x1="${f2(x)}" y1="${prY + 6}" x2="${f2(x)}" y2="${f2(py(rwy.elevFt))}" stroke="#000" stroke-width="0.6" stroke-dasharray="2 2"/>`);
    if (l.role !== 'MAP') {
      parts.push(`<text x="${f2(x)}" y="${prY + 18}" font-size="10.5" font-weight="700" text-anchor="middle">${esc(l.fix.ident)}</text>`);
      if (l.role === 'FAF') parts.push(`<path d="M${f2(x - 5)},${prY + 22} L${f2(x + 5)},${prY + 22} L${f2(x)},${prY + 30} Z" fill="#000"/>`);
      parts.push(`<text x="${f2(x + 4)}" y="${f2(y - 6)}" font-size="10.5" text-decoration="underline">${altText(l)}</text>`);
      if (nav?.dme || nav?.type === 'ILS') parts.push(`<text x="${f2(x)}" y="${prY + 42}" font-size="8.5" text-anchor="middle">${d.toFixed(1)} NM</text>`);
    }
  });
  if (precision) pathD = `M${f2(px(dists[0]))},${f2(py(fin[0].altMin ?? 0))} L${f2(px((((fin[0].altMin ?? 0) - rwy.elevFt - (ap.tch ?? 50)) / 318.4)))},${f2(py(fin[0].altMin ?? 0))} L${f2(px(0))},${f2(py(rwy.elevFt + (ap.tch ?? 50)))}`;
  parts.push(`<path d="${pathD}" fill="none" stroke="#000" stroke-width="2.4"/>`);
  if (precision) {
    parts.push(`<text x="${f2(px(dists[1] * 0.5))}" y="${f2(py(rwy.elevFt + 300) + 24)}" font-size="9.5" font-weight="700" text-anchor="middle">${ap.type === 'ILS' ? 'GS' : 'GP'} ${ap.gsAngle!.toFixed(2)}°</text>`);
    parts.push(`<text x="${f2(px(dists[1] * 0.5))}" y="${f2(py(rwy.elevFt + 300) + 36)}" font-size="9.5" text-anchor="middle">TCH ${ap.tch}</text>`);
  }
  // missed approach icons
  const iy = prY + prH - 34;
  parts.push(`<g transform="translate(${W - 104} ${iy - 46})" font-size="8.5">
    <rect width="88" height="16" fill="none" stroke="#000"/><text x="44" y="11" text-anchor="middle">↑ CLIMB ${ap.missed[ap.missed.length - 1].altMin}</text>
    <rect y="20" width="88" height="16" fill="none" stroke="#000"/><text x="44" y="31" text-anchor="middle">⟳ ${esc(ap.missed[ap.missed.length - 1].fix.ident)} HOLD</text></g>`);
  parts.push(`<text x="${W - 60}" y="${iy + 14}" font-size="8" text-anchor="middle">${(dists[dists.length - 2] ?? 0).toFixed(1)} NM FAF→MAP</text>`);

  // ------------------------------------------------ minimums
  const mnY = prY + prH;
  const rows = ap.minimums.length;
  const rowH = 20;
  parts.push(`<rect x="10" y="${mnY}" width="${W - 20}" height="${22 + rows * rowH}" fill="none" stroke="#000"/>`);
  const catX = [10, 150, 262, 374, 486];
  ['CATEGORY', 'A', 'B', 'C', 'D'].forEach((c, i) => {
    parts.push(`<text x="${catX[i] + (i === 0 ? 8 : 56)}" y="${mnY + 15}" font-size="10.5" font-weight="700" ${i ? 'text-anchor="middle"' : ''}>${c}</text>`);
    if (i) parts.push(`<line x1="${catX[i]}" y1="${mnY}" x2="${catX[i]}" y2="${mnY + 22 + rows * rowH}" stroke="#000"/>`);
  });
  parts.push(`<line x1="10" y1="${mnY + 22}" x2="${W - 10}" y2="${mnY + 22}" stroke="#000"/>`);
  ap.minimums.forEach((m, r) => {
    const y = mnY + 22 + r * rowH;
    parts.push(`<text x="18" y="${y + 14}" font-size="10.5" font-weight="700">${esc(m.label)}</text>`);
    const alt = m.da ?? m.mda;
    for (let i = 1; i <= 4; i++) {
      const extra = m.label === 'CIRCLING' ? (i - 1) * 40 : 0;
      parts.push(`<text x="${catX[i] + 56}" y="${y + 14}" font-size="9.5" text-anchor="middle"><tspan font-weight="700">${(alt ?? 0) + extra}-${esc(m.vis)}</tspan>  ${m.hat + extra} (${Math.ceil((m.hat + extra) / 100)}00-${esc(m.vis)})</text>`);
    }
    parts.push(`<line x1="10" y1="${y + rowH}" x2="${W - 10}" y2="${y + rowH}" stroke="#000" stroke-width="0.5"/>`);
  });

  // ------------------------------------------------ airport sketch
  const skY = mnY + 22 + rows * rowH;
  const skH = H - 10 - skY - 20;
  if (skH > 60) {
    const box = { x: W - 200, y: skY, w: 190, h: skH };
    parts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="#000"/>`);
    const a = airport(ap.airport);
    const ends = a.runways.flatMap((r) => [r.threshold, r.end]);
    const p2 = makeProj([a, ...ends], box, 22);
    parts.push(runwayShape(p2, ap.airport, 6));
    for (const r of a.runways) {
      const p = p2(destination(r.threshold, r.heading + 180, 0.12));
      parts.push(`<text x="${f2(p.x)}" y="${f2(p.y + 3)}" font-size="9" font-weight="700" text-anchor="middle">${r.id}</text>`);
    }
    parts.push(`<text x="${box.x + 6}" y="${box.y + box.h - 6}" font-size="8.5">ELEV ${a.elevFt}</text>`);
    parts.push(`<text x="20" y="${skY + 18}" font-size="10" font-weight="700">${esc(ap.airport)} — ${esc(ap.name)}</text>`);
    parts.push(`<text x="20" y="${skY + 34}" font-size="9.5">FAF to MAP ${(dists[dists.length - 2] ?? 0).toFixed(1)} NM</text>`);
    const t = [60, 90, 120, 140].map((kt) => {
      const sec = ((dists[dists.length - 2] ?? 0) / kt) * 3600;
      return `${kt} KT ${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    });
    parts.push(`<text x="20" y="${skY + 48}" font-size="9">${t.join('   ')}</text>`);
    parts.push(`<text x="20" y="${skY + 66}" font-size="9">Final course ${pad3(ap.finalCourse)}° · Rwy ${ap.runway} ${rwy.lengthFt}×${rwy.widthFt}</text>`);
  }
  parts.push(`<text x="${W / 2}" y="${H - 14}" font-size="9" font-weight="700" text-anchor="middle">SIMULATED — ARDENT ISLANDS TRAINING REGION — NOT FOR NAVIGATION</text>`);
  parts.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plate">${parts.join('')}</svg>`;
}

export function airportDiagram(icao: string): string {
  const a = airport(icao);
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#fff"/>`, `<g font-family="Arial, Helvetica, sans-serif" fill="#000">`];
  parts.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#000" stroke-width="1.5"/>`);
  parts.push(`<text x="${W / 2}" y="36" font-size="18" font-weight="700" text-anchor="middle">AIRPORT DIAGRAM</text>`);
  parts.push(`<text x="${W / 2}" y="56" font-size="12" text-anchor="middle">${esc(a.name)} (${a.icao}) · ${esc(a.city)}</text>`);
  const fq = a.freqs;
  const fl = [fq.atis && `ATIS ${freq(fq.atis)}`, fq.tower && `TOWER ${freq(fq.tower)}`, fq.ground && `GND CON ${freq(fq.ground)}`, fq.ctaf && `CTAF ${freq(fq.ctaf)}`].filter(Boolean).join('   ');
  parts.push(`<text x="${W / 2}" y="76" font-size="11" text-anchor="middle">${fl}</text>`);
  const box = { x: 20, y: 90, w: W - 40, h: H - 170 };
  const ends = a.runways.flatMap((r) => [r.threshold, r.end]);
  const proj = makeProj([a, ...ends], box, 70);
  // taxiway: parallel to the longest runway
  const longest = [...a.runways].sort((x, y) => y.lengthFt - x.lengthFt)[0];
  const t1 = proj(destination(longest.threshold, longest.heading + 90, 0.12));
  const t2 = proj(destination(longest.end, longest.heading + 90, 0.12));
  parts.push(`<line x1="${f2(t1.x)}" y1="${f2(t1.y)}" x2="${f2(t2.x)}" y2="${f2(t2.y)}" stroke="#bbb" stroke-width="9"/>`);
  parts.push(`<text x="${f2((t1.x + t2.x) / 2)}" y="${f2((t1.y + t2.y) / 2 + 4)}" font-size="10" text-anchor="middle" font-weight="700">A</text>`);
  for (let i = 0; i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const p1 = proj(r.threshold);
    const p2 = proj(r.end);
    const w = Math.max(10, (r.widthFt / 6076) * proj.scale * 2.5);
    parts.push(`<line x1="${f2(p1.x)}" y1="${f2(p1.y)}" x2="${f2(p2.x)}" y2="${f2(p2.y)}" stroke="#000" stroke-width="${f2(w)}"/>`);
    parts.push(`<line x1="${f2(p1.x)}" y1="${f2(p1.y)}" x2="${f2(p2.x)}" y2="${f2(p2.y)}" stroke="#fff" stroke-width="1" stroke-dasharray="8 8"/>`);
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    let ang = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    parts.push(`<text x="${f2(mid.x)}" y="${f2(mid.y)}" transform="rotate(${f2(ang)} ${f2(mid.x)} ${f2(mid.y)}) translate(0 ${-w / 2 - 6})" font-size="11" font-weight="700" text-anchor="middle">${r.lengthFt} × ${r.widthFt}</text>`);
  }
  for (const r of a.runways) {
    const p = proj(destination(r.threshold, r.heading + 180, 0.18));
    parts.push(`<text x="${f2(p.x)}" y="${f2(p.y + 5)}" font-size="16" font-weight="700" text-anchor="middle">${r.id}</text>`);
    const q = proj(destination(r.threshold, r.heading + 180, 0.3));
    parts.push(`<text x="${f2(q.x)}" y="${f2(q.y + 4)}" font-size="9" text-anchor="middle">${pad3(r.heading)}.0°</text>`);
  }
  parts.push(`<g transform="translate(${W - 60} 130)"><path d="M0,-26 L9,6 L0,0 L-9,6 Z"/><text y="22" font-size="11" text-anchor="middle">N</text></g>`);
  parts.push(`<text x="40" y="${H - 60}" font-size="11">FIELD ELEV ${a.elevFt}   ·   VAR ${a.magVar === 0 ? '0°' : a.magVar + '°'}</text>`);
  parts.push(`<text x="${W / 2}" y="${H - 14}" font-size="9" font-weight="700" text-anchor="middle">SIMULATED — ARDENT ISLANDS TRAINING REGION — NOT FOR NAVIGATION</text>`);
  parts.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plate">${parts.join('')}</svg>`;
}

export interface ChartEntry {
  id: string;
  airport: string;
  title: string;
  kind: 'IAP' | 'APD';
  approachId?: string;
  render: () => string;
}

export function chartIndex(): ChartEntry[] {
  const out: ChartEntry[] = [];
  for (const a of AIRPORTS) {
    out.push({ id: `${a.icao}-APD`, airport: a.icao, title: 'AIRPORT DIAGRAM', kind: 'APD', render: () => airportDiagram(a.icao) });
    for (const ap of APPROACHES.filter((x) => x.airport === a.icao))
      out.push({ id: ap.id, airport: a.icao, title: ap.name, kind: 'IAP', approachId: ap.id, render: () => approachPlate(ap) });
  }
  return out;
}
