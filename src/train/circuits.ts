// Instructor-configurable IFR flights (pro-simulator style): departure (runway + SID), enroute route (fixes,
// airways), arrival (STAR, approach + transition or vectors, missed or land), ATC amendments in sequence, and
// triggered events (failures, weather changes) — at a time, at a leg or at a fix.
import { S, startAt, setAttitude, devCheck, fmtHdg, type Exercise, type Step, type Ctx, type DrillPlanItem, type DrillRuntime } from './engine';
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
import { FAILURE_LABELS, fullEquipment, type Equipment, type Scenario, type Sim } from '../sim/sim';
import type { Weather } from '../sim/environment';
import { FAILURE_LABELS_FR, type FailureKey } from '../sim/systemsTypes';
import type { DrillFailureSpec, DrillMode } from './procedureTypes';
import { lang as uiLang } from '../ui/i18n';
import { effectiveProcedures } from './procedureStore';

export type CircuitStart =
  /** `airborne`: the flight starts already airborne on the climb-out of that runway, this many ft above the
   *  ground, climbing at Vy (failure drills: "after take-off at 500 ft") */
  | { type: 'runway'; airport: string; runway: string; initialAlt: number; airborne?: number }
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
/** what can make a failure happen: the weather-event triggers plus 'altAgl' (climbing or descending through
 *  `at` ft above the ground), 'random' (once in [at, at + window] minutes, drawn per attempt) and 'instructor'
 *  (only when the instructor fires it) */
export type FailureTrigger = DrillFailureSpec['trigger'];
/** A scheduled failure — a DrillFailureSpec (key, trigger, at, window, fix, dir, expect) plus builder options. */
export interface CircuitFailure extends DrillFailureSpec {
  /** time: minutes after start · leg: leg number (1-based) · altAgl: ft above ground · random: window start
   *  (minutes); unused for the fix and instructor triggers */
  at: number;
  /** trigger 'fix': fails when the aircraft passes within 1 NM of this fix */
  fix?: string;
  /** instructor: not announced in the student's briefing */
  hidden?: boolean;
  /** random failure: the key is drawn from this group at each attempt (two random failures never draw the same
   *  key); `key` is then only a placeholder */
  pool?: FailureKey[];
}

/** where a failure drill starts (drills.ts builds the start and the legs for an airport) */
export type DrillPhase = 'lineup' | 'climbout' | 'cruise' | 'approach' | 'hold';
/** a flight made as a failure drill: training shows the checklist, test hides it */
export interface CircuitDrill {
  mode: DrillMode;
  phase?: DrillPhase;
  /** weather preset of the quick form */
  wx?: 'vmc' | 'imc' | 'low';
  /** a fixed seed: every attempt draws the same random failures (default: a new draw per attempt) */
  seed?: number;
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
  /** failure drill (procedures mode): its mode, phase and weather preset */
  drill?: CircuitDrill;
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
type VLang = 'fr' | 'en';
const failName = (k: FailureKey, l: VLang) => (l === 'fr' ? FAILURE_LABELS_FR[k] : FAILURE_LABELS[k]) ?? k;
/** when a failure / weather change happens, in plain words */
export function triggerText(t: { trigger: FailureTrigger; at: number; fix?: string; window?: number; dir?: 'climb' | 'descent' }, l: VLang = 'en'): string {
  const fr = l === 'fr';
  switch (t.trigger) {
    case 'time':
      return t.at <= 0 ? (fr ? 'dès le départ' : 'at the start') : fr ? `${t.at} min après le départ` : `${t.at} min after the start`;
    case 'leg':
      return fr ? `à l’étape ${t.at}` : `at leg ${t.at}`;
    case 'fix':
      return fr ? `à ${t.fix || '…'}` : `at ${t.fix || '…'}`;
    case 'altAgl':
      return t.dir === 'descent'
        ? fr ? `en descente à ${t.at} ft sol` : `descending through ${t.at} ft AGL`
        : fr ? `en montée à ${t.at} ft sol` : `climbing through ${t.at} ft AGL`;
    case 'random': {
      const b = t.at + Math.max(0, t.window ?? 5);
      return fr ? `au hasard entre ${t.at} et ${b} min` : `at a random time between ${t.at} and ${b} min`;
    }
    case 'instructor':
      return fr ? 'quand l’instructeur la déclenche' : 'when the instructor fires it';
  }
}

const stripLang = (id: string) => id.replace(/\.(fr|en)$/, '');
/** a procedure id (full, base id of a library procedure, or a club procedure) the drill session can find */
function procedureExists(id: string): boolean {
  const b = stripLang(id);
  try {
    return effectiveProcedures().some((p) => p.id === id || stripLang(p.id) === b || (!!p.basedOn && stripLang(p.basedOn) === b));
  } catch {
    return true;
  }
}

/** Problems that keep the flight from being flown, in plain words (`lang` 'fr' for French). An empty list = valid. */
export function validate(c: Circuit, lang: VLang = 'en'): string[] {
  const fr = lang === 'fr';
  const e: string[] = [];
  const L = (n: number, en: string, frs: string) => e.push(fr ? `Étape ${n} : ${frs}` : `Leg ${n}: ${en}`);
  if (!c.name.trim()) e.push(fr ? 'Donnez un nom au vol.' : 'Give the circuit a name.');
  // a failure drill may be only the take-off (lined up / climb-out): no leg needed
  const takeoffOnly = !!c.drill && c.start.type === 'runway';
  if (!c.legs.length && !takeoffOnly) e.push(fr ? 'Ajoutez au moins une étape.' : 'Add at least one leg.');
  if (c.start.type === 'runway') {
    try {
      runway(c.start.airport, c.start.runway);
    } catch {
      e.push(fr ? `Piste inconnue ${c.start.airport} ${c.start.runway}.` : `Unknown runway ${c.start.airport} ${c.start.runway}.`);
    }
    if (c.start.airborne !== undefined && (c.start.airborne < 200 || c.start.airborne > 3000))
      e.push(fr ? 'Départ en montée : entre 200 et 3000 ft sol.' : 'Climb-out start: 200 to 3000 ft above the runway.');
  } else if (!findFix(c.start.fix)) e.push(fr ? `Point de départ inconnu ${c.start.fix}.` : `Unknown start fix ${c.start.fix}.`);
  c.legs.forEach((l, i) => {
    const n = i + 1;
    if (l.type === 'fix' && !l.ident) L(n, 'choose a fix.', 'choisissez un point.');
    else if ((l.type === 'fix' || (l.type === 'hold' && !l.ppos)) && !findFix(l.ident)) L(n, `unknown fix “${l.ident}”.`, `point inconnu « ${l.ident} ».`);
    if (l.type === 'fix' && l.atc === 'cross' && !l.alt) L(n, 'give the crossing altitude.', 'indiquez l’altitude de passage.');
    if (l.type === 'fix' && l.via && findFix(l.ident)) {
      const from = prevFixIdent(c, i);
      if (!from || !airwayFixes(l.via, from, l.ident)) L(n, `${from ?? 'the previous fix'} and ${l.ident} are not both on ${l.via}.`, `${from ?? 'le point précédent'} et ${l.ident} ne sont pas tous deux sur ${l.via}.`);
    }
    if (l.type === 'approach') {
      if (!APPROACHES.some((a) => a.id === l.approachId)) L(n, 'unknown approach.', 'approche inconnue.');
      else if (l.transition && !getApproach(l.approachId).transitions.some((t) => t.name === l.transition)) L(n, `transition ${l.transition} does not exist on this approach.`, `la transition ${l.transition} n’existe pas sur cette approche.`);
      if (l.outcome === 'land' && i !== c.legs.length - 1) L(n, 'a full-stop landing must be the last leg (use “missed approach” to continue).', 'un atterrissage complet doit être la dernière étape (choisissez « approche interrompue » pour continuer).');
    }
    if (l.type === 'sid') {
      if (c.start.type !== 'runway') L(n, 'a SID starts on a runway (start on a runway or remove it).', 'un SID part d’une piste (départ sur piste, ou supprimez-le).');
      else {
        const p = terminalProc(c.start.airport, 'SID', l.id);
        if (!p) L(n, `departure ${l.id} is not published at ${c.start.airport}.`, `le départ ${l.id} n’est pas publié à ${c.start.airport}.`);
        else if (!sidsFor(c.start.airport, c.start.runway).some((x) => x.id === l.id)) L(n, `${l.id} does not serve RWY ${c.start.runway}.`, `${l.id} ne dessert pas la piste ${c.start.runway}.`);
        else if (l.transition && !p.enr.some((t) => t.name === l.transition)) L(n, `${l.id} has no ${l.transition} transition.`, `${l.id} n’a pas de transition ${l.transition}.`);
        if (i !== 0) L(n, 'the SID must be the first leg.', 'le SID doit être la première étape.');
      }
    }
    if (l.type === 'star') {
      const p = terminalProc(l.airport, 'STAR', l.id);
      if (!p) L(n, `arrival ${l.id} is not published at ${l.airport}.`, `l’arrivée ${l.id} n’est pas publiée à ${l.airport}.`);
      else if (l.transition && !p.enr.some((t) => t.name === l.transition)) L(n, `${l.id} has no ${l.transition} transition.`, `${l.id} n’a pas de transition ${l.transition}.`);
    }
    if (l.type === 'hold' && (l.laps < 1 || l.laps > 6)) L(n, '1 to 6 hold circuits.', 'de 1 à 6 tours d’attente.');
    if ((l.type === 'alt' || l.type === 'hold') && (l.alt < 1000 || l.alt > 18000)) L(n, 'altitude must be 1000–18000 ft.', 'l’altitude doit être comprise entre 1000 et 18000 ft.');
  });
  for (const f of c.failures) {
    const F = (en: string, frs: string) => e.push(fr ? `Panne ${failName(f.key, lang)} : ${frs}` : `Failure ${failName(f.key, lang)}: ${en}`);
    if (!(f.key in FAILURE_LABELS)) {
      e.push(fr ? `Panne inconnue « ${String(f.key)} ».` : `Failure: unknown failure “${String(f.key)}”.`);
      continue;
    }
    if (f.trigger === 'leg' && (f.at < 1 || f.at > c.legs.length)) F(`leg ${f.at} does not exist.`, `l’étape ${f.at} n’existe pas.`);
    if (f.trigger === 'fix' && !findFix(f.fix ?? '')) F(`unknown fix “${f.fix ?? ''}”.`, `point inconnu « ${f.fix ?? ''} ».`);
    if (f.trigger === 'time' && !(f.at >= 0 && f.at <= 240)) F('the time must be 0 to 240 min.', 'le délai doit être compris entre 0 et 240 min.');
    if (f.trigger === 'altAgl' && !(f.at >= 50 && f.at <= 15000)) F('the height must be 50 to 15000 ft above the ground.', 'la hauteur doit être comprise entre 50 et 15000 ft sol.');
    if (f.trigger === 'altAgl' && f.dir !== 'descent' && c.start.type === 'runway' && c.start.airborne !== undefined && f.at <= c.start.airborne)
      F(`the flight starts at ${c.start.airborne} ft: choose a higher height, or “descending”.`, `le vol commence à ${c.start.airborne} ft : choisissez une hauteur plus élevée, ou « en descente ».`);
    // an airborne start already above the height: it is never climbed through (unless a missed approach climbs
    // back up)
    if (f.trigger === 'altAgl' && f.dir !== 'descent' && c.start.type === 'air' && !c.legs.some((l) => l.type === 'approach' && l.outcome === 'missed')) {
      const elev = AIRPORTS.find((a) => a.icao === (c.dest ?? c.dep))?.elevFt ?? 0;
      const agl = Math.round((c.start.altFt - elev) / 100) * 100;
      if (agl - f.at > 300)
        F(`the flight starts about ${agl} ft above the ground and never climbs through ${f.at} ft: choose “descending”.`, `le vol commence à environ ${agl} ft sol et ne monte jamais à ${f.at} ft : choisissez « en descente ».`);
    }
    // a height above the highest planned altitude is never climbed through (a SID / STAR / missed approach may
    // climb higher: not checked)
    if (f.trigger === 'altAgl' && f.dir !== 'descent' && !c.legs.some((l) => l.type === 'sid' || l.type === 'star' || (l.type === 'approach' && l.outcome === 'missed'))) {
      let elev: number | undefined;
      try {
        elev = c.start.type === 'runway' ? runway(c.start.airport, c.start.runway).elevFt : AIRPORTS.find((a) => a.icao === (c.dep ?? c.dest))?.elevFt;
      } catch {
        elev = undefined;
      }
      const top = Math.max(
        c.start.type === 'runway' ? c.start.initialAlt : c.start.altFt,
        ...c.legs.map((l) => (l.type === 'fix' ? l.alt ?? 0 : l.type === 'alt' || l.type === 'hold' ? l.alt : 0)),
      );
      const maxAgl = elev === undefined ? Infinity : Math.round((top - elev) / 100) * 100;
      if (f.at > maxAgl + 100)
        F(
          `the flight never climbs that high: its highest planned altitude is ${top} ft, about ${maxAgl} ft above the ground.`,
          `le vol ne monte jamais aussi haut : son altitude prévue la plus haute est ${top} ft, soit environ ${maxAgl} ft sol.`,
        );
    }
    if (f.trigger === 'random' && (!(f.at >= 0) || !((f.window ?? 5) > 0) || f.at + (f.window ?? 5) > 240)) F('the random window must be within 0–240 min and last at least a minute.', 'la fenêtre aléatoire doit rester entre 0 et 240 min et durer au moins une minute.');
    if (f.pool && !f.pool.some((k) => k in FAILURE_LABELS)) F('the random group is empty.', 'le groupe tiré au sort est vide.');
    if (f.expect && !procedureExists(f.expect))
      F('the expected procedure no longer exists: choose another one, or Automatic.', 'la procédure attendue n’existe plus : choisissez-en une autre, ou Automatique.');
  }
  for (const w of c.events ?? []) {
    if (w.trigger === 'leg' && (w.at < 1 || w.at > c.legs.length)) e.push(fr ? `Météo : l’étape ${w.at} n’existe pas.` : `Weather change: leg ${w.at} does not exist.`);
    if (w.trigger === 'fix' && !findFix(w.fix ?? '')) e.push(fr ? `Météo : point inconnu « ${w.fix ?? ''} ».` : `Weather change: unknown fix “${w.fix ?? ''}”.`);
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

/** what the student is told about the scheduled failures (hidden ones are not announced; a test drill announces
 *  none) */
export function failureBrief(c: Circuit, l: VLang = 'en'): string[] {
  const fr = l === 'fr';
  if (c.drill?.mode === 'test')
    return c.failures.length
      ? [fr ? 'Exercice noté : les pannes ne sont pas annoncées, la check-list reste masquée jusqu’à la fin. Appliquez les procédures de mémoire, puis la check-list.' : 'Graded drill: the failures are not announced and the checklist stays hidden until the end. Fly the memory items, then the checklist.']
      : [];
  const shown = c.failures.filter((f) => !f.hidden);
  const out = shown.map((f) =>
    f.pool?.length
      ? fr ? `Une panne tirée au sort survient ${triggerText(f, l)}.` : `A random failure happens ${triggerText(f, l)}.`
      : fr ? `${failName(f.key, l)} : ${triggerText(f, l)}.` : `${failName(f.key, l)}: ${triggerText(f, l)}.`,
  );
  if (c.failures.length > shown.length) out.push(fr ? 'Attendez-vous à l’imprévu.' : 'Expect the unexpected.');
  return out;
}

// ------------------------------------------------------------------ failure plan of an attempt
/** mulberry32 */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** a new seed for an attempt */
export const newSeed = () => (Math.floor(Math.random() * 0x7fffffff) || 1) >>> 0;

/** The failures of one attempt: random times drawn in their window, random keys drawn from their group (never
 *  twice the same key in a flight). Deterministic for a seed. */
export function planFailures(c: Circuit, seed: number): DrillPlanItem[] {
  const rnd = rng(seed);
  const used = new Set<FailureKey>(c.failures.filter((f) => !f.pool?.length).map((f) => f.key));
  return c.failures.map((f, index) => {
    let key = f.key;
    let drawn = false;
    if (f.pool?.length) {
      const ok = f.pool.filter((k) => k in FAILURE_LABELS);
      const fresh = ok.filter((k) => !used.has(k));
      const from = fresh.length ? fresh : ok;
      if (from.length) {
        key = from[Math.min(from.length - 1, Math.floor(rnd() * from.length))];
        drawn = true;
      }
      used.add(key);
    }
    const it: DrillPlanItem = { index, key, trigger: f.trigger, expect: drawn ? undefined : f.expect, hidden: f.hidden, fired: false, firedAtS: null };
    if (drawn) it.drawn = true;
    if (f.trigger === 'time') it.atMin = Math.max(0, f.at);
    if (f.trigger === 'random') {
      const w = Math.max(0, f.window ?? 5);
      it.window = [f.at, f.at + w];
      it.atMin = f.at + rnd() * w;
    }
    return it;
  });
}

/** is the failure due now (time, random, leg, fix, height above ground)? `prev` keeps the last height per failure */
function failureDue(it: DrillPlanItem, f: CircuitFailure, cx: Ctx, legStep: number[], prev: Map<number, number>): boolean {
  switch (it.trigger) {
    case 'instructor':
      return false;
    case 'time':
    case 'random':
      return cx.run.totalT >= (it.atMin ?? 0) * 60;
    case 'leg':
      return cx.run.idx >= (legStep[f.at - 1] ?? Infinity);
    case 'fix': {
      const p = f.fix ? findFix(f.fix) : undefined;
      return !!p && distanceNm(cx.sim.ac.s, p) < 1;
    }
    case 'altAgl': {
      const agl = cx.sim.ac.s.onGround ? 0 : cx.d.aglFt;
      const last = prev.get(it.index);
      prev.set(it.index, agl);
      if (f.dir === 'descent') return last !== undefined && last > f.at && agl <= f.at && !cx.sim.ac.s.onGround;
      // climbing through; a flight that starts right at that height (climb-out start) fails at once
      if (last === undefined) return agl >= f.at && agl < f.at + 150 && cx.d.vsFpm > 100;
      return last < f.at && agl >= f.at;
    }
  }
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

/** `seed`: replay the random failures of a recorded attempt (default: the circuit's fixed seed, else a new draw) */
export function circuitToExercise(c: Circuit, opts: { seed?: number } = {}): Exercise {
  const st = circuitStats(c);
  const ul: VLang = uiLang() === 'fr' ? 'fr' : 'en';
  const drillLines = c.drill
    ? [
        c.drill.mode === 'test'
          ? ul === 'fr' ? 'Exercice de panne — mode test.' : 'Failure drill — test mode.'
          : ul === 'fr' ? 'Exercice de panne — entraînement : la procédure attendue et la check-list sont affichées.' : 'Failure drill — training: the expected procedure and its checklist are shown.',
      ]
    : [];
  const sid = c.legs.find((l) => l.type === 'sid') as Extract<CircuitLeg, { type: 'sid' }> | undefined;
  const firstAp = c.legs.find((l) => l.type === 'approach') as Extract<CircuitLeg, { type: 'approach' }> | undefined;
  const dest = c.dest ?? (firstAp ? safeApproach(firstAp.approachId)?.airport : undefined);
  return {
    id: `circuit:${c.id}`,
    stage: 'S9',
    title: c.name,
    summary: c.description || c.legs.map(legText).join(' · '),
    objectives: c.legs.map(legText),
    // only what the flight has (a take-off drill has no hold or SID to grade)
    standards: (() => {
      const fr = ul === 'fr';
      const has = (t: CircuitLeg['type']) => c.legs.some((l) => l.type === t);
      return [
        fr ? 'Altitude ±100 ft sur les altitudes assignées' : 'Altitude ±100 ft on assigned altitudes',
        ...(has('sid') || has('star') ? [fr ? 'Contraintes d’altitude SID / STAR' : 'SID / STAR altitude constraints'] : []),
        ...(has('hold') ? [fr ? 'Attentes : entrée correcte, 1:00 en rapprochement' : 'Holds: correct entry, 1:00 inbound'] : []),
        ...(has('approach') ? [fr ? 'Approches aux standards ACS' : 'Approaches to ACS standards'] : []),
        ...(c.drill
          ? [fr ? 'Procédures d’urgence : actions de mémoire à temps, check-list complète, trajectoire tenue' : 'Emergency procedures: memory items on time, checklist complete, flight path held']
          : c.failures.length
            ? [fr ? 'Gérer la ou les pannes prévues' : 'Handle the scheduled abnormal(s)']
            : []),
      ];
    })(),
    briefing: [
      ...drillLines,
      ...briefStart(c, sid?.id, ul),
      ul === 'fr'
        ? `${c.legs.length} étape${c.legs.length > 1 ? 's' : ''} · ~${st.distNm.toFixed(0)} NM · ~${st.minutes} min.`
        : `${c.legs.length} leg${c.legs.length === 1 ? '' : 's'} · ~${st.distNm.toFixed(0)} NM · ~${st.minutes} min.`,
      ...(c.mode === 'checkride' ? [ul === 'fr' ? 'Contrôle en vol : aucune aide, noté selon l’ACS.' : 'Checkride: no coaching; graded against the ACS.'] : []),
      ...failureBrief(c, ul),
    ],
    plate: firstAp?.approachId,
    allowAp: c.allowAp,
    minutes: st.minutes,
    setup: (sim) => {
      const steps: Step[] = [];
      let curAlt = 3000;
      if (c.start.type === 'runway' && c.start.airborne) {
        // climb-out: on the extended centreline, `airborne` ft above the runway, full power at Vy, flaps up
        const r = runway(c.start.airport, c.start.runway);
        const agl = c.start.airborne;
        curAlt = Math.max(c.start.initialAlt, r.elevFt + agl + 500);
        // ≈ 0.25 NM of take-off run and initial climb, then ≈ 570 ft/NM at Vy
        const pos = destination(r.threshold, r.heading, 0.25 + agl / 570);
        startAt(sim, {
          pos,
          altFt: r.elevFt + agl,
          hdg: r.heading,
          iasKt: VY_KT,
          weather: c.weather,
          setup: (s) => {
            s.ap.altSel = Math.round(curAlt / 100) * 100;
            s.ap.hdgBug = Math.round(r.heading) || 360;
            s.controls.throttle = 1;
            s.controls.flaps = 0;
            s.controls.trim = CLIMB_TRIM;
          },
        });
        setAttitude(sim, 8.5, 0, VY_KT);
        steps.push({ ...S.takeoff(curAlt, r.heading), text: ul === 'fr' ? `Montée dans l’axe ${fmtHdg(r.heading)} à 74 kt (Vy) jusqu’à ${curAlt} ft` : `Climb runway heading ${fmtHdg(r.heading)} at 74 KIAS (Vy) to ${curAlt} ft` });
      } else if (c.start.type === 'runway') {
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
      // the failures of this attempt (random draws recorded with their seed)
      const seed = opts.seed ?? c.drill?.seed ?? newSeed();
      const drill: DrillRuntime = {
        mode: c.drill?.mode ?? (c.mode === 'checkride' ? 'test' : 'training'),
        isDrill: !!c.drill,
        seed,
        plan: planFailures(c, seed),
      };
      const aglPrev = new Map<number, number>();
      const due = (t: { trigger: EventTrigger; at: number; fix?: string }, cx: Ctx) => {
        if (t.trigger === 'time') return cx.run.totalT >= t.at * 60;
        if (t.trigger === 'leg') return cx.run.idx >= (legStep[t.at - 1] ?? Infinity);
        const f = t.fix ? findFix(t.fix) : undefined;
        return !!f && distanceNm(cx.sim.ac.s, f) < 1;
      };
      const asFiled = c.legs.filter((l) => l.type === 'fix' && !l.atc).map((l) => (l as { ident: string }).ident);
      return {
        steps,
        drill,
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
          for (const it of drill.plan) {
            if (it.fired) continue;
            const f = c.failures[it.index];
            if (f && failureDue(it, f, cx, legStep, aglPrev)) cx.run.fireDrill(it);
          }
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

/** the first briefing line: where the flight starts (FR / EN) */
function briefStart(c: Circuit, sid: string | undefined, l: VLang): string[] {
  const fr = l === 'fr';
  const st = c.start;
  if (st.type === 'runway' && st.airborne)
    return [
      fr
        ? `En montée après le décollage de ${st.airport} piste ${st.runway}, ${st.airborne} ft sol, à Vy vers ${st.initialAlt} ft.`
        : `Airborne after take-off from ${st.airport} RWY ${st.runway}, ${st.airborne} ft above the ground, climbing at Vy to ${st.initialAlt}.`,
    ];
  if (st.type === 'runway')
    return [
      fr
        ? `Départ ${st.airport} piste ${st.runway}${sid ? `, départ ${sid}` : ''}, montée vers ${st.initialAlt} ft.`
        : `Departure ${st.airport} RWY ${st.runway}${sid ? `, ${sid} departure` : ''}, climb to ${st.initialAlt}.`,
    ];
  return [
    fr
      ? `En vol à ${st.distNm} NM au relèvement ${fmtHdg(st.bearing)}° de ${st.fix}, ${st.altFt} ft.`
      : `Airborne ${st.distNm} NM on the ${fmtHdg(st.bearing)}° bearing from ${st.fix}, ${st.altFt} ft.`,
  ];
}

/** Vy and the trim that holds it at full power, flaps up (climb-out start) */
const VY_KT = 74;
const CLIMB_TRIM = -0.02;

/** Ungraded flight (free flight): a plain scenario with the route / approach / hold of the plan loaded. */
export function circuitToScenario(c: Circuit): Scenario {
  let pos: LatLon;
  let alt: number;
  let hdg: number;
  let onGround = false;
  const climb = c.start.type === 'runway' && !!c.start.airborne;
  if (c.start.type === 'runway' && c.start.airborne) {
    const r = runway(c.start.airport, c.start.runway);
    pos = destination(r.threshold, r.heading, 0.25 + c.start.airborne / 570);
    alt = r.elevFt + c.start.airborne;
    hdg = r.heading;
  } else if (c.start.type === 'runway') {
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
    iasKt: onGround ? 0 : c.start.type === 'air' ? c.start.iasKt : climb ? VY_KT : 95,
    onGround,
    weather: { turbulence: 0.15, ...c.weather },
    briefing: [],
    setup: (s: Sim) => {
      s.equip = { ...fullEquipment(), ...(c.equipment ?? {}) };
      s.av.minimums = null;
      s.av.baro = s.weather.qnh;
      s.ap.altSel = c.start.type === 'runway' ? c.start.initialAlt : Math.round(alt / 100) * 100;
      s.ap.hdgBug = Math.round(hdg) || 360;
      if (climb) {
        s.controls.throttle = 1;
        s.controls.flaps = 0;
        s.controls.trim = CLIMB_TRIM;
        setAttitude(s, 8.5, 0, VY_KT);
      }
      const route = filedRoute(flat);
      if (route.length) s.fp.setEnroute([{ ident: 'PPOS', lat: pos.lat, lon: pos.lon }, ...route]);
      if (ap) s.loadApproach(ap.approachId, ap.transition, route.length ? 'load' : ap.transition ? 'activate' : 'vtf');
      else if (hold && !hold.ppos) {
        const f = findFix(hold.ident)!;
        s.fp.setHold({ ident: f.ident, lat: f.lat, lon: f.lon }, hold.inbound, hold.turn, hold.legMin, pos, hold.alt);
      }
      for (const it of planFailures(c, c.drill?.seed ?? newSeed())) if (it.trigger === 'time' && (it.atMin ?? 0) <= 0) s.setFailure(it.key, true);
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
export const appsAt = (icao: string, pred: (a: Approach) => boolean = () => true) =>
  APPROACHES.filter((a) => a.airport === icao && pred(a)).sort((a, b) => rankOf(a) - rankOf(b) || a.runway.localeCompare(b.runway));
export const roundAlt = (ft: number) => Math.ceil(ft / 500) * 500;
export const pickAirport = (want?: string, pred: (icao: string) => boolean = (i) => appsAt(i).length > 0) =>
  (want && AIRPORTS.some((a) => a.icao === want) && pred(want) ? want : AIRPORTS.find((a) => pred(a.icao))?.icao) ?? null;
/** wind straight down the final course of `ap` (the runway in use for that approach) */
export const windFor = (ap: Approach, kt = 10): Partial<Weather> => ({ windDir: Math.round(ap.finalCourse / 10) * 10 || 360, windKt: kt });
/** the published missed-approach hold of an approach, if any */
export function missedHold(ap: Approach) {
  const m = [...ap.missed].reverse().find((l) => l.hold);
  if (!m?.hold) return null;
  return { ident: m.fix.ident, inbound: Math.round(m.hold.inbound) || 360, turn: m.hold.turn, legMin: m.hold.legMin || 1, alt: Math.max(2000, roundAlt(m.altMin ?? 3000)) };
}
export const airStartNear = (ap: Approach, tr: Approach['transitions'][number] | undefined, alt: number): CircuitStart => {
  const f = tr?.legs[0]?.fix ?? ap.final[0].fix;
  const apt = AIRPORTS.find((a) => a.icao === ap.airport);
  const brg = apt ? (bearingDeg(apt, f) + 360) % 360 : (ap.finalCourse + 180) % 360;
  return { type: 'air', fix: f.ident, bearing: Math.round(brg / 5) * 5 % 360, distNm: 10, altFt: alt, hdg: null, iasKt: 100 };
};
export const runwayStart = (icao: string, ap: Approach | undefined): CircuitStart => {
  const a = AIRPORTS.find((x) => x.icao === icao)!;
  const into = ap && ap.airport === icao ? a.runways.find((r) => r.id === ap.runway) : undefined;
  const rw = into ?? [...a.runways].sort((x, y) => y.lengthFt - x.lengthFt)[0];
  return { type: 'runway', airport: icao, runway: rw.id, initialAlt: Math.max(3000, roundAlt(a.elevFt + 2500)) };
};
export const iafAlt = (ap: Approach, tr?: Approach['transitions'][number]) => Math.max(3000, roundAlt(tr?.legs[0]?.altMin ?? ap.final[0]?.altMin ?? 3000));
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
export const currentWorld = (): 'real' | 'training' => (currentRegion() ? 'real' : 'training');

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

/** A circuit read from storage, a file or a link, made safe for this version: missing arrays filled, failures
 *  the simulator does not know dropped, unknown triggers / drill modes reset. Old circuits pass unchanged. */
export function normalizeCircuit(c: Circuit): Circuit {
  const trig: FailureTrigger[] = ['time', 'leg', 'fix', 'altAgl', 'random', 'instructor'];
  c.failures = (Array.isArray(c.failures) ? c.failures : [])
    .filter((f) => f && typeof f === 'object' && (f.key in FAILURE_LABELS || (Array.isArray(f.pool) && f.pool.some((k) => k in FAILURE_LABELS))))
    .map((f) => {
      const out: CircuitFailure = { ...f, trigger: trig.includes(f.trigger) ? f.trigger : 'time', at: Number.isFinite(f.at) ? f.at : 0 };
      if (out.pool) out.pool = out.pool.filter((k) => k in FAILURE_LABELS);
      if (!(out.key in FAILURE_LABELS)) out.key = out.pool![0];
      return out;
    });
  if (c.events && !Array.isArray(c.events)) delete c.events;
  if (c.drill) {
    if (typeof c.drill !== 'object') delete c.drill;
    else if (c.drill.mode !== 'training' && c.drill.mode !== 'test') c.drill.mode = 'training';
  }
  return c;
}

const KEY = 'ifr.circuits.v1';
export const circuitStore = {
  list(): Circuit[] {
    try {
      const all = JSON.parse(localStorage.getItem(KEY) || '[]') as Circuit[];
      return Array.isArray(all) ? all.filter((c) => c && Array.isArray(c.legs) && c.start).map(normalizeCircuit) : [];
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
  return normalizeCircuit(c);
}

export const AIRPORT_RUNWAYS = AIRPORTS.flatMap((a) => a.runways.map((r) => ({ airport: a.icao, runway: r.id })));
