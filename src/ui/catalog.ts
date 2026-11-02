// Unified catalog of everything you can fly, classified by flight type.
import { SCENARIOS, type Scenario } from '../sim/sim';
import { EXERCISES, type Path } from '../train/curriculum';
import type { Exercise } from '../train/engine';
import { approach } from '../nav/data';
import { PRESET_CIRCUITS, circuitStore, circuitToExercise, circuitStats, type Circuit } from '../train/circuits';

export type CatId = 'approaches' | 'procedures' | 'xc' | 'circuits' | 'basics' | 'abnormal' | 'checkride' | 'free';

export const CATEGORIES: { id: CatId; title: string; icon: string; desc: string; subs: string[] }[] = [
  { id: 'approaches', title: 'Approaches', icon: '🛬', desc: 'Every instrument approach type, coupled or hand-flown.', subs: ['ILS & precision', 'Localizer-based (LOC · LDA · BC)', 'VOR & NDB', 'RNAV (GPS)', 'Circling'] },
  { id: 'procedures', title: 'Procedures', icon: '🔁', desc: 'Holdings, entries, DME arcs, procedure turns, interceptions and tracking.', subs: ['Holdings', 'Interceptions', 'DME arcs & procedure turns', 'Tracking & navigation aids'] },
  { id: 'xc', title: 'IFR flights', icon: '🧭', desc: 'Gate-to-gate IFR cross-country flights between airports.', subs: ['Cross-country'] },
  { id: 'circuits', title: 'IFR circuits', icon: '🛠️', desc: 'Instructor-built circuits: start, legs, holds, approaches, weather and scheduled failures.', subs: ['School presets', 'My circuits'] },
  { id: 'basics', title: 'Instrument basics', icon: '🎯', desc: 'Attitude instrument flying and partial panel.', subs: ['Attitude instrument flying', 'Partial panel'] },
  { id: 'abnormal', title: 'Abnormal & emergency', icon: '⚠️', desc: 'Missed approaches, failures, partial-panel approaches.', subs: ['Missed approach & failures'] },
  { id: 'checkride', title: 'Checkride', icon: '🎓', desc: 'Full profiles graded against the ACS.', subs: ['Practical test profiles'] },
  { id: 'free', title: 'Departures & free flight', icon: '✈️', desc: 'Open-ended scenarios to practise anything.', subs: ['Departures', 'Free flight'] },
];

export interface Item {
  id: string;
  kind: 'exercise' | 'scenario';
  cat: CatId;
  sub: string;
  title: string;
  summary: string;
  difficulty: 1 | 2 | 3;
  airport: string;
  minutes: number;
  ap: boolean | null;
  plate?: string;
  graded: boolean;
  ex?: Exercise;
  sc?: Scenario;
  circuit?: Circuit;
  tags: string[];
}

function approachSub(id: string | undefined): string {
  if (!id) return 'ILS & precision';
  const t = approach(id).type;
  if (t === 'ILS') return 'ILS & precision';
  if (t === 'LOC' || t === 'LDA' || t === 'LOCBC') return 'Localizer-based (LOC · LDA · BC)';
  if (t === 'VOR' || t === 'NDB') return 'VOR & NDB';
  return 'RNAV (GPS)';
}

function exItem(e: Exercise): Item {
  let cat: CatId = 'procedures';
  let sub = 'Tracking & navigation aids';
  let diff: 1 | 2 | 3 = 2;
  switch (e.stage) {
    case 'S1':
      cat = 'basics';
      sub = 'Attitude instrument flying';
      diff = e.id === 'bai-steep' || e.id === 'bai-unusual' ? 2 : 1;
      break;
    case 'S2':
      cat = 'basics';
      sub = 'Partial panel';
      diff = 3;
      break;
    case 'S3':
      cat = 'procedures';
      sub = e.id.startsWith('int-') ? 'Interceptions' : e.id === 'nav-arc' ? 'DME arcs & procedure turns' : 'Tracking & navigation aids';
      diff = e.id === 'int-loc90' || e.id === 'nav-arc' || e.id === 'nav-ndb' ? 3 : 2;
      break;
    case 'S4':
      cat = 'procedures';
      sub = 'Holdings';
      diff = ['hold-direct', 'hold-teardrop'].includes(e.id) ? 1 : ['hold-wind', 'hold-random', 'hold-left'].includes(e.id) ? 3 : 2;
      break;
    case 'S5':
      cat = 'approaches';
      sub = e.id === 'app-circle' ? 'Circling' : e.id === 'app-loc' ? 'Localizer-based (LOC · LDA · BC)' : e.id === 'app-ndb-pt' || e.id === 'app-vor-arc' ? 'VOR & NDB' : approachSub(e.plate);
      diff = e.plate ? (approach(e.plate).difficulty as 1 | 2 | 3) : 2;
      if (!e.allowAp && diff < 3) diff = (diff + 1) as 2 | 3;
      break;
    case 'S6':
      cat = 'abnormal';
      sub = 'Missed approach & failures';
      diff = 3;
      break;
    case 'S7':
      cat = 'checkride';
      sub = 'Practical test profiles';
      diff = 3;
      break;
    case 'S8':
      cat = 'xc';
      sub = 'Cross-country';
      diff = 2;
      break;
  }
  const plateApt = e.plate ? approach(e.plate).airport : 'PARD';
  const tags = [e.title, e.summary, sub, e.plate ? approach(e.plate).name : '', e.allowAp ? 'autopilot' : 'hand-flown'];
  return { id: e.id, kind: 'exercise', cat, sub, title: e.title, summary: e.summary, difficulty: diff, airport: plateApt, minutes: e.minutes, ap: e.allowAp, plate: e.plate, graded: true, ex: e, tags };
}

function scItem(s: Scenario): Item {
  let cat: CatId = 'free';
  let sub = s.kind === 'Departure' ? 'Departures' : 'Free flight';
  if (s.kind === 'Precision' || s.kind === 'APV' || s.kind === 'Non-precision') {
    cat = 'approaches';
    sub = s.id === 'loc27' ? 'Localizer-based (LOC · LDA · BC)' : approachSub(s.approachId);
  } else if (s.kind === 'Holding') {
    cat = 'procedures';
    sub = 'Holdings';
  }
  const apt = s.approachId ? approach(s.approachId).airport : 'PARD';
  return { id: `sc-${s.id}`, kind: 'scenario', cat, sub, title: s.name, summary: s.description, difficulty: s.difficulty, airport: apt, minutes: 15, ap: null, plate: s.approachId, graded: false, sc: s, tags: [s.name, s.description, sub] };
}

function circuitItem(c: Circuit, preset: boolean): Item {
  const ex = circuitToExercise(c);
  const apt = ex.plate ? approach(ex.plate).airport : c.start.type === 'runway' ? c.start.airport : 'PARD';
  const diff: 1 | 2 | 3 = c.failures.length || !c.allowAp ? 3 : c.legs.length > 3 ? 2 : 1;
  return { id: ex.id, kind: 'exercise', cat: 'circuits', sub: preset ? 'School presets' : 'My circuits', title: c.name, summary: ex.summary, difficulty: diff, airport: apt, minutes: circuitStats(c).minutes, ap: c.allowAp, plate: ex.plate, graded: true, ex, circuit: c, tags: [c.name, c.description, 'circuit'] };
}

export function catalog(): Item[] {
  return [...EXERCISES.map(exItem), ...SCENARIOS.map(scItem), ...PRESET_CIRCUITS.map((c) => circuitItem(c, true)), ...circuitStore.list().map((c) => circuitItem(c, false))];
}

export function pathItems(p: Path): Item[] {
  const all = catalog();
  return p.exercises.map((id) => all.find((i) => i.id === id)!).filter(Boolean);
}
