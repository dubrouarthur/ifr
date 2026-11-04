// Instructor-configurable IFR flights (pro-simulator style): departure (runway + SID), enroute route (fixes,
// airways), arrival (STAR, approach + transition or vectors, missed or land), ATC amendments in sequence, and
// triggered events (failures, weather changes) — at a time, at a leg or at a fix.
import { S, startAt, devCheck, fmtHdg, type Exercise, type Step, type Ctx } from './engine';
import { HoldEvaluator } from './holdEval';
import { approachSetup } from './setupAssist';
import { findFix, runway, approach as getApproach, APPROACHES, AIRPORTS, NAVAIDS } from '../nav/data';
import { APPROACH_RANK } from '../ui/atis';
import { currentRegion } from '../nav/world';
import type { Approach } from '../nav/types';
import { terminalProc, terminalLegs, sidsFor, starsFor } from '../nav/terminal';
import { parseRoute, airwayFixes, airwayMea } from '../nav/airways';
import { destination, bearingDeg, distanceNm, type LatLon } from '../nav/geo';
import type { Waypoint } from '../nav/flightplan';
import { clearanceText, type HoldDef, type Turn } from '../nav/holding';
import { FAILURE_LABELS, fullEquipment, type Failures, type Equipment, type Scenario, type Sim } from '../sim/sim';
import type { Weather } from '../sim/environment';

export type CircuitStart =
  | { type: 'runway'; airport: string; runway: string; initialAlt: number }
  | { type: 'air'; fix: string; bearing: number; distNm: number; altFt: number; hdg: number | null; iasKt: number };

export type CircuitLeg =
  /** direct to a fix; `via` = along this airway from the previous fix (the intermediate fixes are flown,
   *  see expandLegs); `atc` = an ATC amendment
   *  ("cleared direct …", "cross … at …") issued at that point of the flight */
  | { type: 'fix'; ident: string; alt: number | null; via?: string; atc?: 'direct' | 'cross' }
  | { type: 'alt'; alt: number }
  /** `ppos`: hold at present position (ident 'PPOS'): the fix is where the aircraft is when cleared */
  | { type: 'hold'; ident: string; inbound: number; turn: Turn; legMin: number; alt: number; laps: number; ppos?: boolean }
  /** `change`: ATC changes the approach (amendment) */
  | { type: 'approach'; approachId: string; transition: string | null; outcome: 'land' | 'missed'; change?: boolean }
  /** published departure from the take-off runway (start airport) */
  | { type: 'sid'; id: string; transition: string | null }
  /** published arrival; the runway transition is the one of the next approach */
  | { type: 'star'; airport: string; id: string; transition: string | null };

export type EventTrigger = 'time' | 'leg' | 'fix';
export interface CircuitFailure {
  key: keyof Failures;
  trigger: EventTrigger;
  /** minutes after start, or leg number (1-based); unused for a fix trigger */
  at: number;
  /** trigger 'fix': fails when the aircraft passes within 1 NM of this fix */
  fix?: string;
  /** instructor: not announced in the student's briefing */
  hidden?: boolean;
}
/** a triggered change of the weather (e.g. the ceiling drops below minimums on the approach) */
export interface CircuitEvent {
  kind: 'weather';
  trigger: EventTrigger;
  at: number;
  fix?: string;
  wx: Partial<Weather>;
}

export interface Circuit {
  id: string;
  name: string;
  description: string;
  start: CircuitStart;
  legs: CircuitLeg[];
  weather: Partial<Weather>;
  failures: CircuitFailure[];
  allowAp: boolean;
  mode: 'training' | 'checkride';
  cockpit: 'g1000' | 'steam' | 'airliner' | null;
  /** installed avionics (defaults to fully equipped) */
  equipment?: Equipment;
  timeOfDay?: 'day' | 'dusk' | 'night';
  preset?: boolean;
  updated?: string;
  /** navigation data: real world (the region around `dep` and `dest` is loaded first) or the training region */
  world?: 'real' | 'training';
  /** departure airport (also the start airport on a runway start) and destination */
  dep?: string;
  dest?: string;
  /** triggered weather changes */
  events?: CircuitEvent[];
  /** instructor: the student this flight is assigned to */
  assignee?: string;
  /** false: free flight, no grading */
  graded?: boolean;
  /** cruise altitude used for the route legs created from a route string */
  cruise?: number;
  /** the template it was made from */
  template?: string;
}

export const newCircuit = (): Circuit => ({
  id: `c${Date.now().toString(36)}`,
  name: 'New IFR circuit',
  description: '',
  start: { type: 'runway', airport: 'PARD', runway: '27', initialAlt: 3000 },
  legs: [{ type: 'fix', ident: 'ARD', alt: 3000 }],
  weather: { ceilingFt: 800, visibilitySm: 2, windDir: 250, windKt: 10, turbulence: 0.15 },
  failures: [],
  allowAp: true,
  mode: 'training',
  cockpit: null,
});

// ------------------------------------------------------------------ SID / STAR expansion
/** A leg as flown: SIDs and STARs expanded into their fixes (with the published constraints); `src` is the
 *  index of the circuit leg it comes from. */
export type FlatLeg = (
  | Exclude<CircuitLeg, { type: 'sid' } | { type: 'star' }>
  | { type: 'fix'; ident: string; alt: number | null; via?: string; atc?: 'direct' | 'cross'; proc: 'SID' | 'STAR'; procId: string; amin?: number; amax?: number; speed?: number }
) & { src: number; /** airway segment MEA (fix reached along an airway) */ mea?: number };

const safeApproach = (id: string) => {
  try {
    return getApproach(id);
  } catch {
    return null;
  }
};

/** the runway the STAR at leg `i` leads to: the runway of the next approach of the same airport */
function starRunway(c: Circuit, i: number): string | null {
  for (let k = i + 1; k < c.legs.length; k++) {
    const l = c.legs[k];
    if (l.type === 'approach') return safeApproach(l.approachId)?.runway ?? null;
  }
  return null;
}

/** fixes of a SID / STAR leg (with constraints), or [] when the procedure is not in the loaded region */
export function procFixes(c: Circuit, i: number) {
  const l = c.legs[i];
  if (l?.type === 'sid') {
    if (c.start.type !== 'runway') return [];
    const p = terminalProc(c.start.airport, 'SID', l.id);
    return p ? terminalLegs(p, c.start.runway, l.transition).filter((x) => x.fix) : [];
  }
  if (l?.type === 'star') {
    const p = terminalProc(l.airport, 'STAR', l.id);
    return p ? terminalLegs(p, starRunway(c, i), l.transition).filter((x) => x.fix) : [];
  }
  return [];
}

export function expandLegs(c: Circuit): FlatLeg[] {
  const out: FlatLeg[] = [];
  let last: string | null = c.start.type === 'air' ? c.start.fix : null;
  const lastFix = () => {
    const p = out[out.length - 1];
    return p?.type === 'fix' || (p?.type === 'hold' && !p.ppos) ? p.ident : null;
  };
  c.legs.forEach((l, i) => {
    if (l.type === 'sid' || l.type === 'star') {
      const kind = l.type === 'sid' ? 'SID' : 'STAR';
      for (const t of procFixes(c, i)) {
        if (lastFix() === t.fix!.ident) continue;
        out.push({ type: 'fix', ident: t.fix!.ident, alt: t.altMin !== undefined && t.altMin === t.altMax ? t.altMin : null, proc: kind, procId: l.id, amin: t.altMin, amax: t.altMax, speed: t.speed, src: i });
        last = t.fix!.ident;
      }
      return;
    }
    if (l.type === 'fix') {
      // a route fix that the procedure before it already ends at is not flown twice
      const prev = out[out.length - 1];
      if (prev?.type === 'fix' && 'proc' in prev && prev.ident === l.ident) {
        if (l.alt) prev.alt = l.alt;
        return;
      }
      if (l.via && last) {
        const path = airwayFixes(l.via, last, l.ident);
        if (path) {
          for (let k = 1; k < path.length - 1; k++) out.push({ type: 'fix', ident: path[k].ident, alt: l.alt, via: l.via, src: i, mea: airwayMea(l.via, [path[k - 1].ident, path[k].ident]) });
          const n = path.length;
          out.push({ ...l, src: i, mea: n > 1 ? airwayMea(l.via, [path[n - 2].ident, path[n - 1].ident]) : 0 });
          last = l.ident;
          return;
        }
      }
      out.push({ ...l, src: i });
      last = l.ident;
      return;
    }
    if (l.type === 'hold' && !l.ppos) last = l.ident;
    if (l.type === 'approach') {
      const ap = safeApproach(l.approachId);
      if (ap) last = (l.outcome === 'missed' ? ap.missed[ap.missed.length - 1] : ap.final[ap.final.length - 1])?.fix.ident ?? last;
    }
    out.push({ ...l, src: i } as FlatLeg);
  });
  return out;
}

/** minimum enroute altitude of an airway leg (fix reached `via` an airway from the previous fix) */
export function legMea(c: Circuit, i: number): number {
  const l = c.legs[i];
  if (l?.type !== 'fix' || !l.via) return 0;
  const prev = prevFixIdent(c, i);
  if (!prev) return 0;
  const path = airwayFixes(l.via, prev, l.ident);
  return path ? airwayMea(l.via, path.map((f) => f.ident)) : 0;
}
/** the fix the aircraft flies from at leg `i` (end of the previous leg) */
export function prevFixIdent(c: Circuit, i: number): string | null {
  for (let k = i - 1; k >= 0; k--) {
    const l = c.legs[k];
    if ((l.type === 'fix' || l.type === 'hold') && !(l.type === 'hold' && l.ppos)) return l.ident;
    if (l.type === 'sid' || l.type === 'star') {
      const f = procFixes(c, k);
      if (f.length) return f[f.length - 1].fix!.ident;
    }
    if (l.type === 'approach') {
      const ap = safeApproach(l.approachId);
      if (ap) return (l.outcome === 'missed' ? ap.missed[ap.missed.length - 1] : ap.final[ap.final.length - 1])?.fix.ident ?? null;
    }
  }
  if (c.start.type === 'air') return c.start.fix;
  return null;
}

// ------------------------------------------------------------------ route strings (ICAO / SimBrief style)
/** The enroute part of the flight as a route string, e.g. "KSFO NIITE4.GOBBS V25 SNS DCT TIPRE RISTI1 KSJC" */
export function routeString(c: Circuit): string {
  const t: string[] = [];
  const dep = c.start.type === 'runway' ? c.start.airport : c.dep;
  if (dep) t.push(dep);
  const L = c.legs;
  for (const l of L) {
    if (l.type === 'approach') break;
    if (l.type === 'sid') t.push(l.transition ? `${l.id}.${l.transition}` : l.id);
    else if (l.type === 'star') t.push(l.transition ? `${l.transition}.${l.id}` : l.id);
    else if (l.type === 'fix' && !l.atc && l.ident) {
      if (l.via) t.push(l.via, l.ident);
      else {
        if (t.length > (dep ? 1 : 0)) t.push('DCT');
        t.push(l.ident);
      }
    }
  }
  const ap = L.find((l) => l.type === 'approach') as Extract<CircuitLeg, { type: 'approach' }> | undefined;
  const arr = c.dest ?? (ap ? safeApproach(ap.approachId)?.airport : undefined);
  if (arr && arr !== t[t.length - 1]) t.push(arr);
  return t.join(' ');
}

export interface RouteApply {
  legs: CircuitLeg[];
  dep?: string;
  arr?: string;
  errors: string[];
  /** what each token was understood as (for the route box) */
  items: ReturnType<typeof parseRoute>['items'];
}
/** Parse a route string into flight legs: SID, enroute fixes (airways expanded, each fix tagged with its
 *  airway), STAR. `cruise` is assigned at the first enroute fix. */
export function routeToLegs(text: string, cruise: number | null = null): RouteApply {
  const r = parseRoute(text);
  const legs: CircuitLeg[] = [];
  if (r.sid) legs.push({ type: 'sid', id: r.sid.id, transition: r.sid.transition });
  // walk the tokens again to know which fixes come from which airway
  const toks = text.toUpperCase().replace(/[,;]+/g, ' ').split(/\s+/).filter(Boolean);
  let last: string | null = r.sid?.transition ?? null;
  const push = (ident: string, via?: string) => {
    if (ident === last) return;
    legs.push({ type: 'fix', ident, alt: null, ...(via ? { via } : {}) });
    last = ident;
  };
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    const it = r.items.find((x) => x.token === tk);
    if (!it || it.kind === 'dct' || it.kind === 'airport' || it.kind === 'sid' || it.kind === 'unknown') continue;
    if (it.kind === 'star') continue;
    if (it.kind === 'airway') {
      const to = toks[i + 1];
      if (last && to && airwayFixes(tk, last, to)) push(to, tk);
      i++;
      continue;
    }
    if (it.kind === 'fix') push(tk);
  }
  const firstEnr = legs.find((l) => l.type === 'fix') as Extract<CircuitLeg, { type: 'fix' }> | undefined;
  if (firstEnr && cruise) firstEnr.alt = cruise;
  if (r.star && r.arr) legs.push({ type: 'star', airport: r.arr, id: r.star.id, transition: r.star.transition });
  else if (r.star) {
    const arr = toks.filter((t) => AIRPORTS.some((a) => a.icao === t)).slice(-1)[0];
    if (arr) legs.push({ type: 'star', airport: arr, id: r.star.id, transition: r.star.transition });
  }
  return { legs, dep: r.dep, arr: r.arr, errors: r.errors, items: r.items };
}

/** replace the enroute part (SID, route fixes, STAR before the first approach) of a flight by a route string */
export function applyRoute(c: Circuit, text: string): RouteApply {
  const res = routeToLegs(text, c.cruise ?? null);
  if (res.errors.length) return res;
  // keep what comes after the arrival: the first approach (or hold / alt leg after the enroute part) onward
  let k = 0;
  while (k < c.legs.length && (c.legs[k].type === 'sid' || c.legs[k].type === 'star' || (c.legs[k].type === 'fix' && !(c.legs[k] as { atc?: string }).atc))) k++;
  const tail = c.legs.slice(k);
  const sidOk = c.start.type === 'runway';
  c.legs = [...res.legs.filter((l) => sidOk || l.type !== 'sid'), ...tail];
  if (res.arr) c.dest = res.arr;
  if (res.dep) c.dep = res.dep;
  return res;
}

// ------------------------------------------------------------------ validation
const TRIGGER_TXT = (t: { trigger: EventTrigger; at: number; fix?: string }) =>
  t.trigger === 'time' ? `${t.at} min after the start` : t.trigger === 'leg' ? `at leg ${t.at}` : `at ${t.fix || '…'}`;
export function validate(c: Circuit): string[] {
  const e: string[] = [];
  if (!c.name.trim()) e.push('Give the circuit a name.');
  if (!c.legs.length) e.push('Add at least one leg.');
  if (c.start.type === 'runway') {
    try {
      runway(c.start.airport, c.start.runway);
    } catch {
      e.push(`Unknown runway ${c.start.airport} ${c.start.runway}.`);
    }
  } else if (!findFix(c.start.fix)) e.push(`Unknown start fix ${c.start.fix}.`);
  c.legs.forEach((l, i) => {
    const n = i + 1;
    if (l.type === 'fix' && !l.ident) e.push(`Leg ${n}: choose a fix.`);
    else if ((l.type === 'fix' || (l.type === 'hold' && !l.ppos)) && !findFix(l.ident)) e.push(`Leg ${n}: unknown fix “${l.ident}”.`);
    if (l.type === 'fix' && l.atc === 'cross' && !l.alt) e.push(`Leg ${n}: give the crossing altitude.`);
    if (l.type === 'fix' && l.via && findFix(l.ident)) {
      const from = prevFixIdent(c, i);
      if (!from || !airwayFixes(l.via, from, l.ident)) e.push(`Leg ${n}: ${from ?? 'the previous fix'} and ${l.ident} are not both on ${l.via}.`);
    }
    if (l.type === 'approach') {
      if (!APPROACHES.some((a) => a.id === l.approachId)) e.push(`Leg ${n}: unknown approach.`);
      else if (l.transition && !getApproach(l.approachId).transitions.some((t) => t.name === l.transition)) e.push(`Leg ${n}: transition ${l.transition} does not exist on this approach.`);
      if (l.outcome === 'land' && i !== c.legs.length - 1) e.push(`Leg ${n}: a full-stop landing must be the last leg (use “missed approach” to continue).`);
    }
    if (l.type === 'sid') {
      if (c.start.type !== 'runway') e.push(`Leg ${n}: a SID starts on a runway (start on a runway or remove it).`);
      else {
        const p = terminalProc(c.start.airport, 'SID', l.id);
        if (!p) e.push(`Leg ${n}: departure ${l.id} is not published at ${c.start.airport}.`);
        else if (!sidsFor(c.start.airport, c.start.runway).some((x) => x.id === l.id)) e.push(`Leg ${n}: ${l.id} does not serve RWY ${c.start.runway}.`);
        else if (l.transition && !p.enr.some((t) => t.name === l.transition)) e.push(`Leg ${n}: ${l.id} has no ${l.transition} transition.`);
        if (i !== 0) e.push(`Leg ${n}: the SID must be the first leg.`);
      }
    }
    if (l.type === 'star') {
      const p = terminalProc(l.airport, 'STAR', l.id);
      if (!p) e.push(`Leg ${n}: arrival ${l.id} is not published at ${l.airport}.`);
      else if (l.transition && !p.enr.some((t) => t.name === l.transition)) e.push(`Leg ${n}: ${l.id} has no ${l.transition} transition.`);
    }
    if (l.type === 'hold' && (l.laps < 1 || l.laps > 6)) e.push(`Leg ${n}: 1 to 6 hold circuits.`);
    if ((l.type === 'alt' || l.type === 'hold') && (l.alt < 1000 || l.alt > 18000)) e.push(`Leg ${n}: altitude must be 1000–18000 ft.`);
  });
  for (const f of c.failures) {
    if (f.trigger === 'leg' && (f.at < 1 || f.at > c.legs.length)) e.push(`Failure ${FAILURE_LABELS[f.key]}: leg ${f.at} does not exist.`);
    if (f.trigger === 'fix' && !findFix(f.fix ?? '')) e.push(`Failure ${FAILURE_LABELS[f.key]}: unknown fix “${f.fix ?? ''}”.`);
  }
  for (const w of c.events ?? []) {
    if (w.trigger === 'leg' && (w.at < 1 || w.at > c.legs.length)) e.push(`Weather change: leg ${w.at} does not exist.`);
    if (w.trigger === 'fix' && !findFix(w.fix ?? '')) e.push(`Weather change: unknown fix “${w.fix ?? ''}”.`);
  }
  return e;
}

// ------------------------------------------------------------------ description helpers
const crossTxt = (amin?: number, amax?: number) =>
  amin !== undefined && amin === amax ? `at ${amin}` : amin !== undefined && amax !== undefined ? `between ${amin} and ${amax}` : amin !== undefined ? `at or above ${amin}` : amax !== undefined ? `at or below ${amax}` : '';
export function legText(l: CircuitLeg): string {
  switch (l.type) {
    case 'fix':
      if (l.atc === 'cross') return `ATC: cross ${l.ident} at ${l.alt ?? '…'}`;
      if (l.atc === 'direct') return `ATC: cleared direct ${l.ident}${l.alt ? `, maintain ${l.alt}` : ''}`;
      return `${l.via ? `${l.via} to` : 'Direct'} ${l.ident}${l.alt ? ` at ${l.alt}` : ''}`;
    case 'alt':
      return `ATC: maintain ${l.alt}`;
    case 'hold':
      return `Hold at ${l.ppos ? 'present position' : l.ident}, inbound ${fmtHdg(l.inbound)}°, ${l.turn === 'R' ? 'right' : 'left'} turns, ${l.alt} ft × ${l.laps}`;
    case 'sid':
      return `Departure ${l.id}${l.transition ? `.${l.transition}` : ''}`;
    case 'star':
      return `Arrival ${l.transition ? `${l.transition}.` : ''}${l.id}`;
    case 'approach': {
      const ap = safeApproach(l.approachId);
      if (!ap) return 'Approach not available in the loaded region';
      return `${l.change ? 'ATC change: ' : ''}${ap.airport} ${ap.name} ${l.transition ? `via ${l.transition}` : '(vectors)'} → ${l.outcome === 'land' ? 'land' : 'missed approach'}`;
    }
  }
}

/** Points to draw the circuit on a map (start + each leg's main fixes). */
export function circuitPath(c: Circuit): { ident: string; lat: number; lon: number; kind: 'start' | 'fix' | 'hold' | 'approach' }[] {
  const pts: { ident: string; lat: number; lon: number; kind: 'start' | 'fix' | 'hold' | 'approach' }[] = [];
  try {
    if (c.start.type === 'runway') {
      const r = runway(c.start.airport, c.start.runway);
      pts.push({ ident: `${c.start.airport} ${c.start.runway}`, ...r.threshold, kind: 'start' });
    } else {
      const f = findFix(c.start.fix);
      if (f) pts.push({ ident: 'START', ...destination(f, c.start.bearing, c.start.distNm), kind: 'start' });
    }
  } catch {
    /* start not in the loaded region */
  }
  for (const l of expandLegs(c)) {
    if (l.type === 'fix' || (l.type === 'hold' && !l.ppos)) {
      const f = findFix(l.ident);
      if (f) pts.push({ ident: f.ident, lat: f.lat, lon: f.lon, kind: l.type });
    } else if (l.type === 'approach' && APPROACHES.some((a) => a.id === l.approachId)) {
      const ap = getApproach(l.approachId);
      const tr = ap.transitions.find((t) => t.name === l.transition);
      for (const lg of [...(tr?.legs ?? []), ...ap.final]) pts.push({ ident: lg.fix.ident, lat: lg.fix.lat, lon: lg.fix.lon, kind: 'approach' });
      if (l.outcome === 'missed') {
        const m = ap.missed[ap.missed.length - 1];
        pts.push({ ident: m.fix.ident, lat: m.fix.lat, lon: m.fix.lon, kind: 'approach' });
      }
    }
  }
  return pts;
}

export function circuitStats(c: Circuit): { distNm: number; minutes: number } {
  const p = circuitPath(c);
  let d = 0;
  for (let i = 1; i < p.length; i++) d += distanceNm(p[i - 1], p[i]);
  const holds = c.legs.reduce((a, l) => a + (l.type === 'hold' ? l.laps * 4.5 : 0), 0);
  return { distNm: d, minutes: Math.round((d / 95) * 60 + holds + (c.start.type === 'runway' ? 3 : 0)) };
}

/** what the student is told about the scheduled failures (hidden ones are not announced) */
export function failureBrief(c: Circuit): string[] {
  const shown = c.failures.filter((f) => !f.hidden);
  const out = shown.map((f) => `${FAILURE_LABELS[f.key]} fails ${TRIGGER_TXT(f)}.`);
  if (c.failures.length > shown.length) out.push('Expect the unexpected.');
  return out;
}

// ------------------------------------------------------------------ to a graded exercise
function approachStep(l: Extract<CircuitLeg, { type: 'approach' }>, last: boolean): Step[] {
  const ap = getApproach(l.approachId);
  const steps: Step[] = [
    {
      text: `ATC: "${l.change ? 'Amended clearance: c' : 'C'}leared ${ap.name} approach${l.transition ? ` via ${l.transition}` : ', vectors to final'}." Fly it${l.outcome === 'missed' ? ' and execute the published missed approach at minimums' : ' and land'}.`,
      hint: 'Brief the plate: tune & identify, CRS, minimums, missed approach.',
      setup: (c) => approachSetup(c.sim, l.approachId),
      onStart: (c) => {
        c.mem.t0 = c.sim.time;
        c.sim.loadApproach(l.approachId, l.transition, l.transition ? 'activate' : 'vtf');
      },
      done: (c) => {
        const r = c.sim.rec;
        const t0 = c.mem.t0 as number;
        if (r.touchdown && r.touchdown.t > t0 && c.sim.ac.s.onGround && c.d.gsKt < 5) return true;
        if (l.outcome === 'missed' && r.missedAt !== null && r.missedAt > t0 && c.d.aglFt > 800) return true;
        return false;
      },
      readout: (c) => (c.sim.fp.out.valid ? `${c.sim.fp.out.toIdent} ${c.sim.fp.out.distNm.toFixed(1)} NM · mins ${c.sim.av.minimums ?? '—'}` : ''),
    },
  ];
  if (l.outcome === 'missed' && !last) {
    const m = ap.missed[ap.missed.length - 1];
    steps.push({
      text: `Missed approach: climb to ${m.altMin ?? 3000} and proceed to ${m.fix.ident} (${ap.missedText})`,
      done: (c) => distanceNm(c.sim.ac.s, m.fix) < 1 && Math.abs(c.sim.indicatedAlt() - (m.altMin ?? 3000)) < 300,
      check: (c) => (c.d.stallWarn ? 'Stall warning' : null),
      readout: (c) => `${m.fix.ident} ${distanceNm(c.sim.ac.s, m.fix).toFixed(1)} NM`,
    });
  }
  return steps;
}

/** route fixes of the plan up to the first approach (SID / STAR expanded) — what is filed in the GPS */
function filedRoute(flat: FlatLeg[]): Waypoint[] {
  const route: Waypoint[] = [];
  for (const l of flat) {
    if (l.type === 'approach') break;
    if (l.type !== 'fix' || ('atc' in l && l.atc)) continue;
    const f = findFix(l.ident);
    if (f && route[route.length - 1]?.ident !== f.ident) route.push({ ident: f.ident, lat: f.lat, lon: f.lon });
  }
  return route;
}

export function circuitToExercise(c: Circuit): Exercise {
  const st = circuitStats(c);
  const sid = c.legs.find((l) => l.type === 'sid') as Extract<CircuitLeg, { type: 'sid' }> | undefined;
  const firstAp = c.legs.find((l) => l.type === 'approach') as Extract<CircuitLeg, { type: 'approach' }> | undefined;
  const dest = c.dest ?? (firstAp ? safeApproach(firstAp.approachId)?.airport : undefined);
  return {
    id: `circuit:${c.id}`,
    stage: 'S9',
    title: c.name,
    summary: c.description || c.legs.map(legText).join(' · '),
    objectives: c.legs.map(legText),
    standards: ['Altitude ±100 ft on assigned altitudes', 'SID / STAR altitude constraints', 'Holds: correct entry, 1:00 inbound', 'Approaches to ACS standards', ...(c.failures.length ? ['Handle the scheduled abnormal(s)'] : [])],
    briefing: [
      c.start.type === 'runway' ? `Departure ${c.start.airport} RWY ${c.start.runway}${sid ? `, ${sid.id} departure` : ''}, climb to ${c.start.initialAlt}.` : `Airborne ${c.start.distNm} NM on the ${fmtHdg(c.start.bearing)}° bearing from ${c.start.fix}, ${c.start.altFt} ft.`,
      `${c.legs.length} legs · ~${st.distNm.toFixed(0)} NM · ~${st.minutes} min.`,
      ...(c.mode === 'checkride' ? ['Checkride: no coaching; graded against the ACS.'] : []),
      ...failureBrief(c),
    ],
    plate: firstAp?.approachId,
    allowAp: c.allowAp,
    minutes: st.minutes,
    setup: (sim) => {
      const steps: Step[] = [];
      let curAlt = 3000;
      if (c.start.type === 'runway') {
        const r = runway(c.start.airport, c.start.runway);
        curAlt = c.start.initialAlt;
        startAt(sim, { pos: destination(r.threshold, r.heading, 0.05), altFt: r.elevFt, hdg: r.heading, iasKt: 0, onGround: true, weather: c.weather, setup: (s) => { s.ap.altSel = curAlt; s.ap.hdgBug = Math.round(r.heading) || 360; } });
        steps.push(S.takeoff(curAlt, r.heading));
      } else {
        const f = findFix(c.start.fix)!;
        const pos = destination(f, c.start.bearing, c.start.distNm);
        const hdg = c.start.hdg ?? bearingDeg(pos, f);
        curAlt = c.start.altFt;
        startAt(sim, { pos, altFt: c.start.altFt, hdg, iasKt: c.start.iasKt, weather: c.weather, setup: (s) => { s.ap.altSel = curAlt; s.ap.hdgBug = Math.round(hdg) || 360; } });
      }
      sim.assess = { ...sim.assess, mode: c.mode };
      sim.equip = { ...fullEquipment(), ...(c.equipment ?? {}) };
      let firstHold: HoldDef | undefined;
      const legStep: number[] = [];
      const flat = expandLegs(c);
      flat.forEach((l, i) => {
        const last = i === flat.length - 1;
        if (legStep[l.src] === undefined) legStep[l.src] = steps.length;
        if (l.type === 'fix') {
          const f = findFix(l.ident)!;
          const proc = 'proc' in l ? l : null;
          const alt = l.alt ?? (proc ? Math.max(proc.amin ?? -Infinity, Math.min(curAlt, proc.amax ?? Infinity)) : curAlt);
          curAlt = alt;
          // the rest of the consecutive fix legs form the active route
          const route: string[] = [];
          for (let k = i; k < flat.length && flat[k].type === 'fix'; k++) route.push((flat[k] as { ident: string }).ident);
          const window = proc ? crossTxt(proc.amin, proc.amax) : '';
          const text = proc
            ? `${proc.proc === 'SID' ? `${proc.procId} departure` : `${proc.procId} arrival`}: ${l.ident}${window ? `, cross ${window}` : ''}${proc.speed ? `, ${proc.speed} kt max` : ''}`
            : l.atc === 'direct'
              ? `ATC: "Cleared direct ${l.ident}${l.alt ? `, maintain ${alt}` : ''}."`
              : l.atc === 'cross'
                ? `ATC: "Cross ${l.ident} at ${alt}."`
                : `Proceed ${l.via ? `via ${l.via} to` : 'direct'} ${l.ident}${l.alt ? `, maintain ${alt}` : ''}`;
          steps.push({
            text,
            onStart: (cx: Ctx) => {
              const fp = cx.sim.fp;
              // already in the filed plan (at or after the active leg): keep it — it carries the loaded approach
              const k = fp.wpts.findIndex((w, j) => j >= fp.active && w.ident === l.ident);
              if (k > fp.active && !fp.approachActive) fp.activateLeg(k);
              if (k < 0) fp.setEnroute([{ ident: 'PPOS', lat: cx.sim.ac.s.lat, lon: cx.sim.ac.s.lon }, ...route.map((r) => { const x = findFix(r)!; return { ident: x.ident, lat: x.lat, lon: x.lon }; })]);
            },
            done: (cx) => distanceNm(cx.sim.ac.s, f) < 0.8 || (cx.t > 5 && cx.sim.fp.out.valid && cx.sim.fp.out.toIdent !== l.ident && cx.sim.fp.wpts.findIndex((w) => w.ident === l.ident) < cx.sim.fp.active),
            check: (cx) => {
              if (proc) {
                // procedure constraints are checked crossing the fix
                if (distanceNm(cx.sim.ac.s, f) > 1) return cx.d.stallWarn ? 'Stall warning' : null;
                const a = cx.sim.indicatedAlt();
                if (proc.amin !== undefined && a < proc.amin - 100) return `Below the ${proc.amin} ft constraint at ${l.ident}`;
                if (proc.amax !== undefined && a > proc.amax + 100) return `Above the ${proc.amax} ft constraint at ${l.ident}`;
                return null;
              }
              if (Math.abs(cx.sim.indicatedAlt() - alt) < 80) cx.mem.level = true;
              return cx.mem.level ? devCheck(cx, { alt }) : cx.d.stallWarn ? 'Stall warning' : null;
            },
            readout: (cx) => `${l.ident} ${distanceNm(cx.sim.ac.s, f).toFixed(1)} NM · ${window || `${alt} ft`}`,
            graceSec: 5,
          });
        } else if (l.type === 'alt') {
          const dir = l.alt > curAlt ? 'Climb' : 'Descend';
          curAlt = l.alt;
          steps.push({ ...S.changeAlt(l.alt, 95, null, undefined), text: `ATC: "${dir} and maintain ${l.alt}."`, check: (cx) => (cx.d.stallWarn ? 'Stall warning' : null) });
        } else if (l.type === 'hold') {
          const f = l.ppos ? { ident: 'PPOS', lat: 0, lon: 0, kind: 'fix' as const } : findFix(l.ident)!;
          curAlt = l.alt;
          const def: HoldDef = { fix: { ident: f.ident, lat: f.lat, lon: f.lon }, inbound: l.inbound, turn: l.turn, legMin: l.legMin, altFt: l.alt };
          firstHold ??= def;
          const hs = S.hold(def, l.laps);
          steps.push({
            ...hs,
            text: l.ppos
              ? `ATC: "Hold at present position, inbound course ${fmtHdg(l.inbound)}, ${l.turn === 'R' ? 'right' : 'left'} turns, ${l.legMin}-minute legs, maintain ${l.alt}." — ${l.laps} circuit${l.laps > 1 ? 's' : ''}`
              : `ATC: "${clearanceText(def, f.kind === 'vor')}" — ${l.laps} circuit${l.laps > 1 ? 's' : ''}`,
            onStart: (cx) => {
              if (l.ppos) Object.assign(def.fix, { lat: cx.sim.ac.s.lat, lon: cx.sim.ac.s.lon });
              cx.sim.fp.setHold({ ...def.fix }, l.inbound, l.turn, l.legMin, cx.sim.ac.s, l.alt);
              if (cx.run.holdEval?.def !== def) cx.run.holdEval = new HoldEvaluator(def);
            },
          });
        } else {
          steps.push(...approachStep(l, last));
        }
      });
      // the filed flight plan is in the GPS before departure, like a real FMS: the route up to the first
      // approach, then that approach (loaded, not activated). Hold / approach steps refine it in flight.
      if (sim.equip.gps) {
        const route = filedRoute(flat);
        if (route.length) sim.fp.setEnroute([{ ident: 'PPOS', lat: sim.ac.s.lat, lon: sim.ac.s.lon }, ...route]);
        if (firstAp && safeApproach(firstAp.approachId)) sim.loadApproach(firstAp.approachId, firstAp.transition, 'load');
      }
      const fired = new Set<string>();
      const due = (t: { trigger: EventTrigger; at: number; fix?: string }, cx: Ctx) => {
        if (t.trigger === 'time') return cx.run.totalT >= t.at * 60;
        if (t.trigger === 'leg') return cx.run.idx >= (legStep[t.at - 1] ?? Infinity);
        const f = t.fix ? findFix(t.fix) : undefined;
        return !!f && distanceNm(cx.sim.ac.s, f) < 1;
      };
      const asFiled = c.legs.filter((l) => l.type === 'fix' && !l.atc).map((l) => (l as { ident: string }).ident);
      return {
        steps,
        hold: firstHold,
        acs: c.legs.some((l) => l.type === 'approach'),
        allowanceSec: 30 + flat.length * 10,
        clearance:
          c.start.type === 'runway'
            ? sid
              ? `Cleared to ${dest ?? 'destination'} via the ${sid.id} departure${sid.transition ? `, ${sid.transition} transition` : ''}, then as filed. Climb via SID, maintain ${c.start.initialAlt}. Squawk 4651.`
              : `Cleared as filed: ${asFiled.join(' ') || 'radar vectors'}. Climb and maintain ${c.start.initialAlt}. Squawk 4651.`
            : undefined,
        tick: (cx) => {
          c.failures.forEach((f, k) => {
            if (fired.has(`f${k}`) || !due(f, cx)) return;
            fired.add(`f${k}`);
            cx.sim.setFailure(f.key, true);
          });
          (c.events ?? []).forEach((w, k) => {
            if (fired.has(`w${k}`) || !due(w, cx)) return;
            fired.add(`w${k}`);
            Object.assign(cx.sim.weather, w.wx);
          });
        },
      };
    },
  };
}

/** Ungraded flight (free flight): a plain scenario with the route / approach / hold of the plan loaded. */
export function circuitToScenario(c: Circuit): Scenario {
  let pos: LatLon;
  let alt: number;
  let hdg: number;
  let onGround = false;
  if (c.start.type === 'runway') {
    const r = runway(c.start.airport, c.start.runway);
    pos = destination(r.threshold, r.heading, 0.05);
    alt = r.elevFt;
    hdg = r.heading;
    onGround = true;
  } else {
    const f = findFix(c.start.fix)!;
    pos = destination(f, c.start.bearing, c.start.distNm);
    alt = c.start.altFt;
    hdg = c.start.hdg ?? bearingDeg(pos, f);
  }
  const flat = expandLegs(c);
  const ap = flat.find((l) => l.type === 'approach') as Extract<CircuitLeg, { type: 'approach' }> | undefined;
  const hold = flat.find((l) => l.type === 'hold') as Extract<CircuitLeg, { type: 'hold' }> | undefined;
  return {
    id: 'custom',
    name: c.name,
    description: c.legs.length ? `${c.legs.length} legs · custom flight` : 'Custom free flight',
    kind: 'Free flight',
    difficulty: 2,
    approachId: ap?.approachId,
    pos,
    altFt: alt,
    hdg,
    iasKt: onGround ? 0 : c.start.type === 'air' ? c.start.iasKt : 95,
    onGround,
    weather: { turbulence: 0.15, ...c.weather },
    briefing: [],
    setup: (s: Sim) => {
      s.equip = { ...fullEquipment(), ...(c.equipment ?? {}) };
      s.av.minimums = null;
      s.av.baro = s.weather.qnh;
      s.ap.altSel = c.start.type === 'runway' ? c.start.initialAlt : Math.round(alt / 100) * 100;
      s.ap.hdgBug = Math.round(hdg) || 360;
      const route = filedRoute(flat);
      if (route.length) s.fp.setEnroute([{ ident: 'PPOS', lat: pos.lat, lon: pos.lon }, ...route]);
      if (ap) s.loadApproach(ap.approachId, ap.transition, route.length ? 'load' : ap.transition ? 'activate' : 'vtf');
      else if (hold && !hold.ppos) {
        const f = findFix(hold.ident)!;
        s.fp.setHold({ ident: f.ident, lat: f.lat, lon: f.lon }, hold.inbound, hold.turn, hold.legMin, pos, hold.alt);
      }
      for (const f of c.failures) if (f.trigger === 'time' && f.at <= 0) s.setFailure(f.key, true);
    },
  };
}

// ------------------------------------------------------------------ presets & storage
export const PRESET_CIRCUITS: Circuit[] = [
  {
    id: 'p-classic',
    preset: true,
    name: 'Classic IR circuit — Port Ardent',
    description: 'Depart 27, ARD hold, ILS 27 with missed approach, then NDB 27 via the procedure turn to a full stop. The standard school training detail.',
    start: { type: 'runway', airport: 'PARD', runway: '27', initialAlt: 3000 },
    legs: [
      { type: 'fix', ident: 'ARD', alt: 3000 },
      { type: 'hold', ident: 'ARD', inbound: 270, turn: 'R', legMin: 1, alt: 3000, laps: 2 },
      { type: 'approach', approachId: 'PARD-I27', transition: 'ARD', outcome: 'missed' },
      { type: 'approach', approachId: 'PARD-N27', transition: 'PA (PROC TURN)', outcome: 'land' },
    ],
    weather: { ceilingFt: 600, visibilitySm: 1.5, windDir: 250, windKt: 12, turbulence: 0.15 },
    failures: [],
    allowAp: true,
    mode: 'training',
    cockpit: null,
  },
  {
    id: 'p-valley',
    preset: true,
    name: 'Mistral Valley loop',
    description: 'Airborne west of MSVL: RNAV 03 LNAV/VNAV missed, hold at MSV, VOR/DME 21 via the 10 DME arc to land.',
    start: { type: 'air', fix: 'SCREE', bearing: 270, distNm: 8, altFt: 4500, hdg: null, iasKt: 100 },
    legs: [
      { type: 'approach', approachId: 'MSVL-R03', transition: 'SCREE', outcome: 'missed' },
      { type: 'hold', ident: 'MSV', inbound: 210, turn: 'R', legMin: 1, alt: 4500, laps: 1 },
      { type: 'fix', ident: 'TOMAS', alt: 4500 },
      { type: 'approach', approachId: 'MSVL-V21', transition: 'TOMAS (10 DME ARC)', outcome: 'land' },
    ],
    weather: { ceilingFt: 1700, visibilitySm: 1.5, windDir: 320, windKt: 16, gustKt: 22, turbulence: 0.35 },
    failures: [],
    allowAp: true,
    mode: 'training',
    cockpit: null,
  },
  {
    id: 'p-pp',
    preset: true,
    name: 'Partial-panel circuit (checkride)',
    description: 'Hand-flown. The AHRS/vacuum fails 3 minutes in: non-standard left hold at KEDDY, then the ILS 27 to land on standby instruments.',
    start: { type: 'air', fix: 'KEDDY', bearing: 20, distNm: 10, altFt: 4000, hdg: null, iasKt: 95 },
    legs: [
      { type: 'hold', ident: 'KEDDY', inbound: 270, turn: 'L', legMin: 1, alt: 4000, laps: 1 },
      { type: 'alt', alt: 3000 },
      { type: 'approach', approachId: 'PARD-I27', transition: null, outcome: 'land' },
    ],
    weather: { ceilingFt: 700, visibilitySm: 1.5, windDir: 220, windKt: 12, turbulence: 0.2 },
    failures: [{ key: 'ahrs', trigger: 'time', at: 3 }],
    allowAp: false,
    mode: 'checkride',
    cockpit: 'steam',
  },
  {
    id: 'p-cross',
    preset: true,
    name: 'PARD → MSVL → PARD round trip',
    description: 'Out to Mistral Valley for the ILS 03 missed approach, back via TOBEY for the ILS 27 with a glideslope failure on final.',
    start: { type: 'runway', airport: 'PARD', runway: '09', initialAlt: 4000 },
    legs: [
      { type: 'fix', ident: 'KEDDY', alt: 4000 },
      { type: 'fix', ident: 'SCREE', alt: 4000 },
      { type: 'approach', approachId: 'MSVL-I03', transition: 'SCREE', outcome: 'missed' },
      { type: 'fix', ident: 'TOBEY', alt: 4500 },
      { type: 'approach', approachId: 'PARD-I27', transition: 'TOBEY', outcome: 'land' },
    ],
    weather: { ceilingFt: 450, visibilitySm: 1, windDir: 240, windKt: 14, turbulence: 0.2 },
    failures: [{ key: 'gs', trigger: 'leg', at: 5 }],
    allowAp: true,
    mode: 'training',
    cockpit: 'airliner',
  },
];

// ------------------------------------------------------------------ templates (any airport of the loaded region)
export interface TemplateCtx {
  /** departure / home airport (defaults to the first airport with approaches) */
  airport?: string;
  /** destination (cross-country) */
  dest?: string;
}
export interface FlightTemplate {
  id: string;
  name: string;
  desc: string;
  build(o?: TemplateCtx): Circuit | null;
}

const rankOf = (a: Approach) => APPROACH_RANK[a.type] ?? 9;
const appsAt = (icao: string, pred: (a: Approach) => boolean = () => true) =>
  APPROACHES.filter((a) => a.airport === icao && pred(a)).sort((a, b) => rankOf(a) - rankOf(b) || a.runway.localeCompare(b.runway));
const roundAlt = (ft: number) => Math.ceil(ft / 500) * 500;
const pickAirport = (want?: string, pred: (icao: string) => boolean = (i) => appsAt(i).length > 0) =>
  (want && AIRPORTS.some((a) => a.icao === want) && pred(want) ? want : AIRPORTS.find((a) => pred(a.icao))?.icao) ?? null;
/** wind straight down the final course of `ap` (the runway in use for that approach) */
const windFor = (ap: Approach, kt = 10): Partial<Weather> => ({ windDir: Math.round(ap.finalCourse / 10) * 10 || 360, windKt: kt });
/** the published missed-approach hold of an approach, if any */
export function missedHold(ap: Approach) {
  const m = [...ap.missed].reverse().find((l) => l.hold);
  if (!m?.hold) return null;
  return { ident: m.fix.ident, inbound: Math.round(m.hold.inbound) || 360, turn: m.hold.turn, legMin: m.hold.legMin || 1, alt: Math.max(2000, roundAlt(m.altMin ?? 3000)) };
}
const airStartNear = (ap: Approach, tr: Approach['transitions'][number] | undefined, alt: number): CircuitStart => {
  const f = tr?.legs[0]?.fix ?? ap.final[0].fix;
  const apt = AIRPORTS.find((a) => a.icao === ap.airport);
  const brg = apt ? (bearingDeg(apt, f) + 360) % 360 : (ap.finalCourse + 180) % 360;
  return { type: 'air', fix: f.ident, bearing: Math.round(brg / 5) * 5 % 360, distNm: 10, altFt: alt, hdg: null, iasKt: 100 };
};
const runwayStart = (icao: string, ap: Approach | undefined): CircuitStart => {
  const a = AIRPORTS.find((x) => x.icao === icao)!;
  const into = ap && ap.airport === icao ? a.runways.find((r) => r.id === ap.runway) : undefined;
  const rw = into ?? [...a.runways].sort((x, y) => y.lengthFt - x.lengthFt)[0];
  return { type: 'runway', airport: icao, runway: rw.id, initialAlt: Math.max(3000, roundAlt(a.elevFt + 2500)) };
};
const iafAlt = (ap: Approach, tr?: Approach['transitions'][number]) => Math.max(3000, roundAlt(tr?.legs[0]?.altMin ?? ap.final[0]?.altMin ?? 3000));
const base = (id: string, name: string, description: string, start: CircuitStart, legs: CircuitLeg[], extra: Partial<Circuit> = {}): Circuit => ({
  id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
  name,
  description,
  start,
  legs,
  weather: { ceilingFt: 800, visibilitySm: 2, windDir: 250, windKt: 10, turbulence: 0.15 },
  failures: [],
  allowAp: true,
  mode: 'training',
  cockpit: null,
  world: currentWorld(),
  template: id,
  ...extra,
});
/** which navigation data is loaded (templates tag their flights with it) */
const currentWorld = (): 'real' | 'training' => (currentRegion() ? 'real' : 'training');

export const TEMPLATES: FlightTemplate[] = [
  {
    id: 't-vorhold',
    name: 'Hold over a VOR',
    desc: 'Airborne 10 NM out: proceed to the VOR, enter and fly two standard holds (AIM entry graded).',
    build(o = {}) {
      const icao = pickAirport(o.airport, () => true);
      const apt = AIRPORTS.find((a) => a.icao === icao);
      if (!apt) return null;
      const vors = NAVAIDS.filter((n) => n.type === 'VOR' || n.type === 'VORDME').sort((a, b) => distanceNm(a, apt) - distanceNm(b, apt));
      const v = vors[0];
      if (!v || !findFix(v.ident)) return null;
      // a published hold at that VOR first (missed approach / hold-in-lieu), else on the radial from the airport
      let pub: ReturnType<typeof missedHold> = null;
      for (const ap of APPROACHES) {
        const m = missedHold(ap);
        if (m && m.ident === v.ident) pub = m;
      }
      const inbound = pub?.inbound ?? ((Math.round(bearingDeg(v, apt) / 10) * 10) % 360 || 360);
      const alt = pub?.alt ?? Math.max(3000, roundAlt(apt.elevFt + 2500));
      return base('t-vorhold', `Hold at ${v.ident}`, `Proceed direct ${v.ident} and fly two ${pub ? 'published' : 'standard right'} holds at ${alt} ft. Plan the entry before the fix.`,
        { type: 'air', fix: v.ident, bearing: (inbound + 130) % 360, distNm: 10, altFt: alt, hdg: null, iasKt: 100 },
        [{ type: 'hold', ident: v.ident, inbound, turn: pub?.turn ?? 'R', legMin: pub?.legMin ?? 1, alt, laps: 2 }],
        { weather: { ceilingFt: 1500, visibilitySm: 3, windDir: (inbound + 40) % 360, windKt: 15, turbulence: 0.2 }, dep: icao ?? undefined, dest: icao ?? undefined });
    },
  },
  {
    id: 't-ilsmissed',
    name: 'ILS with missed approach and hold',
    desc: 'The ILS (best precision approach) to minimums, the published missed approach and its hold.',
    build(o = {}) {
      const icao = pickAirport(o.dest ?? o.airport);
      if (!icao) return null;
      const ap = appsAt(icao)[0];
      const tr = ap.transitions[0];
      const alt = iafAlt(ap, tr);
      const mh = missedHold(ap);
      const legs: CircuitLeg[] = [{ type: 'approach', approachId: ap.id, transition: tr?.name ?? null, outcome: 'missed' }];
      if (mh) legs.push({ type: 'hold', ...mh, laps: 1 });
      return base('t-ilsmissed', `${ap.airport} ${ap.name} · missed approach`, `Fly the ${ap.name} to minimums, go around, fly the published missed approach${mh ? ` and hold at ${mh.ident}` : ''}.`,
        tr ? airStartNear(ap, tr, alt) : { ...airStartNear(ap, undefined, alt) },
        legs,
        { weather: { ceilingFt: 150, visibilitySm: 0.5, ...windFor(ap, 8), turbulence: 0.1 }, dep: icao, dest: icao });
    },
  },
  {
    id: 't-ppndb',
    name: 'Partial panel NDB',
    desc: 'Steam gauges, hand-flown: the attitude indicator fails two minutes in, then a non-precision approach.',
    build(o = {}) {
      const icao = pickAirport(o.dest ?? o.airport);
      if (!icao) return null;
      const all = appsAt(icao);
      const ap = all.find((a) => a.type === 'NDB') ?? all.find((a) => a.type === 'VOR') ?? all.find((a) => a.category === 'Non-precision') ?? all[0];
      const tr = ap.transitions[0];
      return base('t-ppndb', `Partial panel ${ap.airport} ${ap.name}`, `Hand-flown on standby instruments: AHRS failure after 2 minutes, then the ${ap.name} to a landing.`,
        airStartNear(ap, tr, iafAlt(ap, tr)),
        [{ type: 'approach', approachId: ap.id, transition: tr?.name ?? null, outcome: 'land' }],
        { failures: [{ key: 'ahrs', trigger: 'time', at: 2 }], allowAp: false, cockpit: 'steam', weather: { ceilingFt: 900, visibilitySm: 2, ...windFor(ap, 10), turbulence: 0.2 }, dep: icao, dest: icao });
    },
  },
  {
    id: 't-xc',
    name: 'Cross-country with SID/STAR',
    desc: 'Departure on the published SID, the enroute route, the STAR and the best approach to a full stop.',
    build(o = {}) {
      const dep = pickAirport(o.airport, (i) => AIRPORTS.find((a) => a.icao === i)!.runways.length > 0);
      if (!dep) return null;
      const dest = pickAirport(o.dest && o.dest !== dep ? o.dest : undefined, (i) => i !== dep && appsAt(i).length > 0) ?? dep;
      const ap = appsAt(dest)[0];
      if (!ap) return null;
      const start = runwayStart(dep, undefined) as Extract<CircuitStart, { type: 'runway' }>;
      const legs: CircuitLeg[] = [];
      const sid = sidsFor(dep, start.runway).find((p) => p.enr.length) ?? sidsFor(dep, start.runway)[0];
      if (sid) legs.push({ type: 'sid', id: sid.id, transition: sid.enr[0]?.name ?? null });
      const stars = starsFor(dest);
      const star = stars.find((p) => !p.rwy.length || p.rwy.some((r) => /ALL/.test(r.name) || r.name.replace(/^RW/, '').startsWith(ap.runway.replace(/[LRC]$/, '')))) ?? stars[0];
      const tr = ap.transitions[0];
      if (star) legs.push({ type: 'star', airport: dest, id: star.id, transition: star.enr[0]?.name ?? null });
      else if (tr) legs.push({ type: 'fix', ident: tr.legs[0].fix.ident, alt: iafAlt(ap, tr) });
      legs.push({ type: 'approach', approachId: ap.id, transition: tr?.name ?? null, outcome: 'land' });
      const c = base('t-xc', `${dep} → ${dest}`, `${sid ? `${sid.id} departure, ` : ''}${star ? `${star.id} arrival, ` : ''}${ap.name} to a full stop.`, start, legs, { dep, dest, cruise: Math.max(4000, start.initialAlt + 2000), weather: { ceilingFt: 700, visibilitySm: 2, ...windFor(ap, 10), turbulence: 0.15 } });
      return c;
    },
  },
  {
    id: 't-acs',
    name: 'ACS mock checkride',
    desc: 'Instrument rating practical test profile: departure, hold, a non-precision approach with the missed, then a precision approach to land. A failure is hidden from the student.',
    build(o = {}) {
      const icao = pickAirport(o.airport);
      if (!icao) return null;
      const all = appsAt(icao);
      const prec = all.find((a) => a.category === 'Precision') ?? all[0];
      const np = all.find((a) => a.category === 'Non-precision' && a.id !== prec.id) ?? all.find((a) => a.id !== prec.id) ?? prec;
      const npTr = np.transitions[0];
      const mh = missedHold(np);
      const start = runwayStart(icao, prec);
      const legs: CircuitLeg[] = [];
      if (npTr) legs.push({ type: 'fix', ident: npTr.legs[0].fix.ident, alt: iafAlt(np, npTr) });
      if (mh) legs.push({ type: 'hold', ...mh, laps: 1 });
      legs.push({ type: 'approach', approachId: np.id, transition: npTr?.name ?? null, outcome: 'missed' });
      legs.push({ type: 'approach', approachId: prec.id, transition: null, outcome: 'land' });
      return base('t-acs', `Mock checkride · ${icao}`, `Departure, ${mh ? `hold at ${mh.ident}, ` : ''}${np.name} with the missed approach, then the ${prec.name} to land (vectors). Graded against the ACS, no coaching.`, start, legs, {
        mode: 'checkride',
        allowAp: true,
        failures: [{ key: 'ap', trigger: 'leg', at: legs.length, hidden: true }],
        weather: { ceilingFt: 500, visibilitySm: 1.5, ...windFor(prec, 12), turbulence: 0.2 },
        dep: icao,
        dest: icao,
      });
    },
  },
];

const KEY = 'ifr.circuits.v1';
export const circuitStore = {
  list(): Circuit[] {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]') as Circuit[];
    } catch {
      return [];
    }
  },
  save(c: Circuit) {
    const all = circuitStore.list().filter((x) => x.id !== c.id);
    all.unshift({ ...c, preset: false, updated: new Date().toISOString() });
    try {
      localStorage.setItem(KEY, JSON.stringify(all.slice(0, 200)));
    } catch {
      /* ignore */
    }
  },
  remove(id: string) {
    try {
      localStorage.setItem(KEY, JSON.stringify(circuitStore.list().filter((x) => x.id !== id)));
    } catch {
      /* ignore */
    }
  },
};

/** URL-safe share encoding. */
export function encodeCircuit(c: Circuit): string {
  const json = JSON.stringify({ ...c, preset: undefined, updated: undefined });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCircuit(s: string): Circuit {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const c = JSON.parse(new TextDecoder().decode(bytes)) as Circuit;
  if (!c || !Array.isArray(c.legs) || !c.start) throw new Error('Not a circuit');
  return c;
}

export const AIRPORT_RUNWAYS = AIRPORTS.flatMap((a) => a.runways.map((r) => ({ airport: a.icao, runway: r.id })));
