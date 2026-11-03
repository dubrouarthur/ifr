// Flight setup model (wizard state) and its conversion to a circuit or a free-flight scenario. DOM-free.
import { approach as getApproach, findFix, runway, AIRPORTS, APPROACHES } from '../nav/data';
import { fullEquipment, type Equipment, type Scenario, type Sim } from '../sim/sim';
import type { Weather } from '../sim/environment';
import type { Circuit, CircuitFailure, CircuitLeg, CircuitStart } from './circuits';
import type { Turn } from '../nav/holding';
import { destination, bearingDeg, type LatLon } from '../nav/geo';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export type StartKind = 'runway' | 'air' | 'final';
export type FlightType = 'route' | 'approach' | 'hold' | 'free';

export interface FlightSetupState {
  type: FlightType;
  name: string;
  cockpit: 'g1000' | 'steam' | 'airliner';
  equipment: Equipment;
  svt: boolean;
  /** built-in training region or real-world navigation data */
  world: 'training' | 'real';
  dep: string;
  arr: string;
  start: StartKind;
  rwy: { airport: string; runway: string; initialAlt: number };
  air: { fix: string; bearing: number; distNm: number; altFt: number; iasKt: number };
  final: { approachId: string; distNm: number };
  route: string[];
  cruise: number;
  arrival: { approachId: string | null; transition: string | null; outcome: 'land' | 'missed' };
  hold: { enabled: boolean; fix: string; inbound: number; turn: Turn; legMin: number; alt: number; laps: number };
  weather: Partial<Weather>;
  tod: 'day' | 'dusk' | 'night';
  graded: boolean;
  mode: 'training' | 'checkride';
  handFlown: boolean;
  failures: CircuitFailure[];
}

export const defaultSetup = (): FlightSetupState => ({
  type: 'route',
  name: '',
  cockpit: 'g1000',
  equipment: fullEquipment(),
  svt: true,
  world: 'real',
  dep: '',
  arr: '',
  start: 'runway',
  rwy: { airport: 'PARD', runway: '27', initialAlt: 3000 },
  air: { fix: 'ARD', bearing: 90, distNm: 12, altFt: 3000, iasKt: 95 },
  final: { approachId: 'PARD-I27', distNm: 8 },
  route: ['ARD', 'SCREE'],
  cruise: 5000,
  arrival: { approachId: 'MSVL-R03', transition: 'SCREE', outcome: 'land' },
  hold: { enabled: false, fix: 'ARD', inbound: 270, turn: 'R', legMin: 1, alt: 3000, laps: 2 },
  weather: { ceilingFt: 900, visibilitySm: 2, windDir: 250, windKt: 10, gustKt: 0, turbulence: 0.15, qnh: 29.92 },
  tod: 'day',
  graded: true,
  mode: 'training',
  handFlown: false,
  failures: [],
});

// ------------------------------------------------------------------ conversion
export function setupStart(st: FlightSetupState): CircuitStart {
  if (st.start === 'runway') return { type: 'runway', ...st.rwy };
  if (st.start === 'air') return { type: 'air', fix: st.air.fix, bearing: st.air.bearing, distNm: st.air.distNm, altFt: st.air.altFt, hdg: null, iasKt: st.air.iasKt };
  const ap = getApproach(st.final.approachId);
  const map = ap.final[ap.final.length - 1].fix;
  const rw = runway(ap.airport, ap.runway);
  const faf = ap.final.find((l) => l.role === 'FAF')?.altMin ?? 2500;
  const alt = ap.gsAngle ? Math.round((rw.elevFt + 50 + st.final.distNm * 318.4) / 10) * 10 : Math.max(faf, rw.elevFt + 1000);
  return { type: 'air', fix: map.ident, bearing: (ap.finalCourse + 180) % 360, distNm: st.final.distNm, altFt: Math.min(alt, faf + 600), hdg: ap.finalCourse, iasKt: 90 };
}

export function setupToCircuit(st: FlightSetupState): Circuit {
  const legs: CircuitLeg[] = [];
  if (st.type === 'route') for (const r of st.route) legs.push({ type: 'fix', ident: r, alt: st.cruise });
  if ((st.type === 'hold' || st.hold.enabled) && st.type !== 'free') legs.push({ type: 'hold', ident: st.hold.fix, inbound: st.hold.inbound, turn: st.hold.turn, legMin: st.hold.legMin, alt: st.hold.alt, laps: st.hold.laps });
  const arrId = st.type === 'approach' && st.start === 'final' ? st.final.approachId : st.arrival.approachId;
  if (arrId && (st.type === 'route' || st.type === 'approach'))
    legs.push({ type: 'approach', approachId: arrId, transition: st.type === 'approach' && st.start === 'final' ? null : st.arrival.transition, outcome: st.arrival.outcome });
  return {
    id: `fs${Date.now().toString(36)}`,
    name: st.name || autoName(st),
    description: '',
    start: setupStart(st),
    legs,
    weather: clone(st.weather),
    failures: clone(st.failures),
    allowAp: st.equipment.ap && !st.handFlown,
    mode: st.mode,
    cockpit: st.cockpit,
    equipment: clone(st.equipment),
    timeOfDay: st.tod,
  };
}

export function autoName(st: FlightSetupState): string {
  const arr = st.arrival.approachId ? getApproach(st.arrival.approachId) : null;
  if (st.type === 'route') return `${st.start === 'runway' ? st.rwy.airport : st.air.fix} → ${arr ? `${arr.airport} ${arr.name}` : st.route[st.route.length - 1] ?? 'route'}`;
  if (st.type === 'approach') {
    const ap = getApproach(st.start === 'final' ? st.final.approachId : st.arrival.approachId ?? st.final.approachId);
    return `${ap.airport} ${ap.name} practice`;
  }
  if (st.type === 'hold') return `Holding at ${st.hold.fix}`;
  return 'Free flight';
}

/** Ungraded flight: a plain scenario with the route/approach/hold loaded. */
export function setupToScenario(st: FlightSetupState): Scenario {
  const c = setupToCircuit(st);
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
  return {
    id: 'custom',
    name: c.name,
    description: c.legs.length ? `${c.legs.length} legs · custom flight` : 'Custom free flight',
    kind: 'Free flight',
    difficulty: 2,
    approachId: c.legs.find((l) => l.type === 'approach') ? (c.legs.find((l) => l.type === 'approach') as { approachId: string }).approachId : undefined,
    pos,
    altFt: alt,
    hdg,
    iasKt: onGround ? 0 : c.start.type === 'air' ? c.start.iasKt : 95,
    onGround,
    weather: { turbulence: 0.15, ...c.weather },
    briefing: [],
    setup: (s: Sim) => {
      s.equip = { ...st.equipment };
      s.av.minimums = null;
      s.av.baro = s.weather.qnh;
      s.ap.altSel = c.start.type === 'runway' ? c.start.initialAlt : Math.round(alt / 100) * 100;
      s.ap.hdgBug = Math.round(hdg) || 360;
      const route = c.legs.filter((l) => l.type === 'fix').map((l) => findFix((l as { ident: string }).ident)!).filter(Boolean);
      const ap = c.legs.find((l) => l.type === 'approach') as Extract<CircuitLeg, { type: 'approach' }> | undefined;
      const hold = c.legs.find((l) => l.type === 'hold') as Extract<CircuitLeg, { type: 'hold' }> | undefined;
      if (route.length) s.fp.setEnroute([{ ident: 'PPOS', lat: pos.lat, lon: pos.lon }, ...route.map((f) => ({ ident: f.ident, lat: f.lat, lon: f.lon }))]);
      if (ap) s.loadApproach(ap.approachId, ap.transition, route.length ? 'load' : ap.transition ? 'activate' : 'vtf');
      else if (hold) {
        const f = findFix(hold.ident)!;
        s.fp.setHold({ ident: f.ident, lat: f.lat, lon: f.lon }, hold.inbound, hold.turn, hold.legMin, pos, hold.alt);
      }
      for (const f of c.failures) if (f.trigger === 'time' && f.at <= 0) s.setFailure(f.key, true);
    },
  };
}


/** After a (real-world) region load: point every reference of the setup at data that exists in the new region —
 *  departure runway (longest), arrival approach (ILS first), start fix, hold fix, route — and suggest a direct
 *  route to the first IAF when the route is empty. */
export function adaptSetupToRegion(st: FlightSetupState) {
  const dep = AIRPORTS.find((a) => a.icao === st.dep) ?? AIRPORTS[0];
  if (dep && (st.rwy.airport !== dep.icao || !dep.runways.some((x) => x.id === st.rwy.runway))) {
    const best = [...dep.runways].sort((a, b) => b.lengthFt - a.lengthFt)[0];
    st.rwy = { airport: dep.icao, runway: best.id, initialAlt: Math.max(3000, Math.ceil((dep.elevFt + 2500) / 500) * 500) };
  }
  const arrApps = APPROACHES.filter((a) => a.airport === st.arr);
  const pref = arrApps.find((a) => a.type === 'ILS') ?? arrApps.find((a) => a.type === 'RNAV') ?? arrApps[0];
  if (pref && !arrApps.some((a) => a.id === st.arrival.approachId)) {
    st.arrival = { approachId: pref.id, transition: pref.transitions[0]?.name ?? null, outcome: st.arrival.outcome };
  }
  if (pref && !arrApps.some((a) => a.id === st.final.approachId)) st.final = { approachId: st.arrival.approachId ?? pref.id, distNm: st.final.distNm };
  if (!findFix(st.air.fix)) st.air.fix = st.arr || st.dep;
  if (!findFix(st.hold.fix)) st.hold.fix = pref?.missed[pref.missed.length - 1]?.fix.ident ?? st.arr;
  st.route = st.route.filter((f) => findFix(f));
  if (!st.route.length && st.arrival.approachId && st.dep !== st.arr) {
    const ap = APPROACHES.find((a) => a.id === st.arrival.approachId);
    const tr = ap?.transitions.find((t) => t.name === st.arrival.transition) ?? ap?.transitions[0];
    if (tr) st.route = [tr.legs[0].fix.ident];
  }
}
