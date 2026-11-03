// Instructor-configurable IFR circuits (pro-simulator style): start, legs, weather, failures.
import { S, startAt, devCheck, fmtHdg, type Exercise, type Step, type Ctx } from './engine';
import { HoldEvaluator } from './holdEval';
import { approachSetup } from './setupAssist';
import { findFix, runway, approach as getApproach, APPROACHES, AIRPORTS } from '../nav/data';
import { destination, bearingDeg, distanceNm } from '../nav/geo';
import type { Waypoint } from '../nav/flightplan';
import { clearanceText, type HoldDef, type Turn } from '../nav/holding';
import { FAILURE_LABELS, fullEquipment, type Failures, type Equipment } from '../sim/sim';
import type { Weather } from '../sim/environment';

export type CircuitStart =
  | { type: 'runway'; airport: string; runway: string; initialAlt: number }
  | { type: 'air'; fix: string; bearing: number; distNm: number; altFt: number; hdg: number | null; iasKt: number };

export type CircuitLeg =
  | { type: 'fix'; ident: string; alt: number | null }
  | { type: 'alt'; alt: number }
  | { type: 'hold'; ident: string; inbound: number; turn: Turn; legMin: number; alt: number; laps: number }
  | { type: 'approach'; approachId: string; transition: string | null; outcome: 'land' | 'missed' };

export interface CircuitFailure {
  key: keyof Failures;
  trigger: 'time' | 'leg';
  /** minutes after start, or leg number (1-based) */
  at: number;
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

// ------------------------------------------------------------------ validation
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
    if ((l.type === 'fix' || l.type === 'hold') && !findFix(l.ident)) e.push(`Leg ${n}: unknown fix “${l.ident}”.`);
    if (l.type === 'approach') {
      if (!APPROACHES.some((a) => a.id === l.approachId)) e.push(`Leg ${n}: unknown approach.`);
      else if (l.transition && !getApproach(l.approachId).transitions.some((t) => t.name === l.transition)) e.push(`Leg ${n}: transition ${l.transition} does not exist on this approach.`);
      if (l.outcome === 'land' && i !== c.legs.length - 1) e.push(`Leg ${n}: a full-stop landing must be the last leg (use “missed approach” to continue).`);
    }
    if (l.type === 'hold' && (l.laps < 1 || l.laps > 6)) e.push(`Leg ${n}: 1 to 6 hold circuits.`);
    if ((l.type === 'alt' || l.type === 'hold') && (l.alt < 1000 || l.alt > 15000)) e.push(`Leg ${n}: altitude must be 1000–15000 ft.`);
  });
  for (const f of c.failures) if (f.trigger === 'leg' && (f.at < 1 || f.at > c.legs.length)) e.push(`Failure ${FAILURE_LABELS[f.key]}: leg ${f.at} does not exist.`);
  return e;
}

// ------------------------------------------------------------------ description helpers
export function legText(l: CircuitLeg): string {
  switch (l.type) {
    case 'fix':
      return `Direct ${l.ident}${l.alt ? ` at ${l.alt}` : ''}`;
    case 'alt':
      return `ATC: maintain ${l.alt}`;
    case 'hold':
      return `Hold at ${l.ident}, inbound ${fmtHdg(l.inbound)}°, ${l.turn === 'R' ? 'right' : 'left'} turns, ${l.alt} ft × ${l.laps}`;
    case 'approach': {
      const ap = getApproach(l.approachId);
      return `${ap.airport} ${ap.name} ${l.transition ? `via ${l.transition}` : '(vectors)'} → ${l.outcome === 'land' ? 'land' : 'missed approach'}`;
    }
  }
}

/** Points to draw the circuit on a map (start + each leg's main fixes). */
export function circuitPath(c: Circuit): { ident: string; lat: number; lon: number; kind: 'start' | 'fix' | 'hold' | 'approach' }[] {
  const pts: { ident: string; lat: number; lon: number; kind: 'start' | 'fix' | 'hold' | 'approach' }[] = [];
  if (c.start.type === 'runway') {
    const r = runway(c.start.airport, c.start.runway);
    pts.push({ ident: `${c.start.airport} ${c.start.runway}`, ...r.threshold, kind: 'start' });
  } else {
    const f = findFix(c.start.fix);
    if (f) pts.push({ ident: 'START', ...destination(f, c.start.bearing, c.start.distNm), kind: 'start' });
  }
  for (const l of c.legs) {
    if (l.type === 'fix' || l.type === 'hold') {
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

// ------------------------------------------------------------------ to a graded exercise
function approachStep(l: Extract<CircuitLeg, { type: 'approach' }>, last: boolean): Step[] {
  const ap = getApproach(l.approachId);
  const steps: Step[] = [
    {
      text: `ATC: "Cleared ${ap.name} approach${l.transition ? ` via ${l.transition}` : ', vectors to final'}." Fly it${l.outcome === 'missed' ? ' and execute the published missed approach at minimums' : ' and land'}.`,
      hint: 'Brief the plate · tune & identify · CRS · minimums · missed approach.',
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

export function circuitToExercise(c: Circuit): Exercise {
  const st = circuitStats(c);
  return {
    id: `circuit:${c.id}`,
    stage: 'S9',
    title: c.name,
    summary: c.description || c.legs.map(legText).join(' · '),
    objectives: c.legs.map(legText),
    standards: ['Altitude ±100 ft on assigned altitudes', 'Holds: correct entry, 1:00 inbound', 'Approaches to ACS standards', ...(c.failures.length ? ['Handle the scheduled abnormal(s)'] : [])],
    briefing: [
      c.start.type === 'runway' ? `Departure ${c.start.airport} RWY ${c.start.runway}, climb to ${c.start.initialAlt}.` : `Airborne ${c.start.distNm} NM on the ${fmtHdg(c.start.bearing)}° bearing from ${c.start.fix}, ${c.start.altFt} ft.`,
      `${c.legs.length} legs · ~${st.distNm.toFixed(0)} NM · ~${st.minutes} min.`,
      ...(c.mode === 'checkride' ? ['Checkride: no coaching; graded against the ACS.'] : []),
      ...(c.failures.length ? ['Expect the unexpected.'] : []),
    ],
    plate: c.legs.find((l) => l.type === 'approach') ? (c.legs.find((l) => l.type === 'approach') as { approachId: string }).approachId : undefined,
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
      c.legs.forEach((l, i) => {
        const last = i === c.legs.length - 1;
        legStep[i] = steps.length;
        if (l.type === 'fix') {
          const f = findFix(l.ident)!;
          const alt = l.alt ?? curAlt;
          curAlt = alt;
          // the rest of the consecutive fix legs form the active route
          const route: string[] = [];
          for (let k = i; k < c.legs.length && c.legs[k].type === 'fix'; k++) route.push((c.legs[k] as { ident: string }).ident);
          steps.push({
            text: `Proceed direct ${l.ident}${l.alt ? `, maintain ${alt}` : ''}`,
            onStart: (cx: Ctx) => {
              const fp = cx.sim.fp;
              // already in the filed plan (at or after the active leg): keep it — it carries the loaded approach
              const k = fp.wpts.findIndex((w, j) => j >= fp.active && w.ident === l.ident);
              if (k > fp.active && !fp.approachActive) fp.activateLeg(k);
              if (k < 0) fp.setEnroute([{ ident: 'PPOS', lat: cx.sim.ac.s.lat, lon: cx.sim.ac.s.lon }, ...route.map((r) => { const x = findFix(r)!; return { ident: x.ident, lat: x.lat, lon: x.lon }; })]);
            },
            done: (cx) => distanceNm(cx.sim.ac.s, f) < 0.8 || (cx.t > 5 && cx.sim.fp.out.valid && cx.sim.fp.out.toIdent !== l.ident && cx.sim.fp.wpts.findIndex((w) => w.ident === l.ident) < cx.sim.fp.active),
            check: (cx) => {
              if (Math.abs(cx.sim.indicatedAlt() - alt) < 80) cx.mem.level = true;
              return cx.mem.level ? devCheck(cx, { alt }) : cx.d.stallWarn ? 'Stall warning' : null;
            },
            readout: (cx) => `${l.ident} ${distanceNm(cx.sim.ac.s, f).toFixed(1)} NM · ${alt} ft`,
            graceSec: 5,
          });
        } else if (l.type === 'alt') {
          const dir = l.alt > curAlt ? 'Climb' : 'Descend';
          curAlt = l.alt;
          steps.push({ ...S.changeAlt(l.alt, 95, null, undefined), text: `ATC: "${dir} and maintain ${l.alt}."`, check: (cx) => (cx.d.stallWarn ? 'Stall warning' : null) });
        } else if (l.type === 'hold') {
          const f = findFix(l.ident)!;
          curAlt = l.alt;
          const def: HoldDef = { fix: { ident: f.ident, lat: f.lat, lon: f.lon }, inbound: l.inbound, turn: l.turn, legMin: l.legMin, altFt: l.alt };
          firstHold ??= def;
          const hs = S.hold(def, l.laps);
          steps.push({
            ...hs,
            text: `ATC: "${clearanceText(def, f.kind === 'vor')}" — ${l.laps} circuit${l.laps > 1 ? 's' : ''}`,
            onStart: (cx) => {
              cx.sim.fp.setHold({ ident: f.ident, lat: f.lat, lon: f.lon }, l.inbound, l.turn, l.legMin, cx.sim.ac.s, l.alt);
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
        const route: Waypoint[] = [];
        for (const l of c.legs) {
          if (l.type === 'approach') break;
          if (l.type !== 'fix') continue;
          const f = findFix(l.ident);
          if (f && route[route.length - 1]?.ident !== f.ident) route.push({ ident: f.ident, lat: f.lat, lon: f.lon });
        }
        const firstAp = c.legs.find((l) => l.type === 'approach') as Extract<CircuitLeg, { type: 'approach' }> | undefined;
        if (route.length) sim.fp.setEnroute([{ ident: 'PPOS', lat: sim.ac.s.lat, lon: sim.ac.s.lon }, ...route]);
        if (firstAp) sim.loadApproach(firstAp.approachId, firstAp.transition, 'load');
      }
      const fired = new Set<number>();
      return {
        steps,
        hold: firstHold,
        acs: c.legs.some((l) => l.type === 'approach'),
        allowanceSec: 30 + c.legs.length * 10,
        clearance: c.start.type === 'runway' ? `Cleared as filed: ${c.legs.filter((l) => l.type === 'fix').map((l) => (l as { ident: string }).ident).join(' ') || 'radar vectors'}. Climb and maintain ${c.start.initialAlt}. Squawk 4651.` : undefined,
        tick: (cx) => {
          c.failures.forEach((f, k) => {
            if (fired.has(k)) return;
            const due = f.trigger === 'time' ? cx.run.totalT >= f.at * 60 : cx.run.idx >= (legStep[f.at - 1] ?? Infinity);
            if (due) {
              fired.add(k);
              cx.sim.setFailure(f.key, true);
            }
          });
        },
      };
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
