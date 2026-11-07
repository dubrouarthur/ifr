// Training records storage (no UI dependencies).
import { store } from './dom';
import type { ProcedureResult } from '../train/procedureTypes';

export interface Attempt {
  id: string;
  date: string;
  student: string;
  scenario: string;
  approach: string;
  mode: 'training' | 'checkride';
  score: number;
  grade: string;
  acs: string;
  failedTasks: string[];
  failures: string[];
  durationSec: number;
  /** false: too little flown to grade (score is not meaningful). Older records have no field (= graded). */
  graded?: boolean;
  /** exercise id and title when the flight was a lesson attempt */
  exercise?: string;
  exerciseTitle?: string;
  /** lesson attempt result */
  passed?: boolean;
  /** the course step this flight was flown for (a course's Fly it, SPEC §9.8) */
  course?: { id: string; rev: number; stepId: string; token: string };
}
/** a training record with the emergency procedures graded during the flight (procedures mode: failure drills,
 *  instructor failures). Every record may carry them; older records have none. */
export type ProcAttempt = Attempt & { procedures?: ProcedureResult[] };

/** one procedure of an attempt as the CSV and the records read it: what was late, missed or out of order */
export function procedureSummary(r: ProcedureResult) {
  const req = r.items.filter((i) => !i.optional);
  const name = (i: ProcedureResult['items'][number]) => i.text ?? i.id;
  return {
    late: req.filter((i) => i.done && i.late).map(name),
    missed: req.filter((i) => !i.done).map(name),
    outOfOrder: req.filter((i) => i.done && !i.inOrder).map(name),
    notFromMemory: req.filter((i) => i.memory && i.done && !i.fromMemory).map(name),
    done: req.filter((i) => i.done).length,
    total: req.length,
  };
}

const KEY = 'ifr.history.v1';
export const history = {
  all(): ProcAttempt[] {
    return store.get<ProcAttempt[]>(KEY, []);
  },
  add(a: ProcAttempt) {
    const list = history.all();
    list.unshift(a);
    store.set(KEY, list.slice(0, 500));
  },
  /** add the record of a flight, or replace the earlier record of the same flight (same id) */
  upsert(a: ProcAttempt) {
    const list = history.all();
    const i = list.findIndex((x) => x.id === a.id);
    if (i >= 0) list[i] = { ...list[i], ...a };
    else list.unshift(a);
    store.set(KEY, list.slice(0, 500));
  },
  clear() {
    store.set(KEY, []);
  },
  /** CSV of the records: one row per flight, and one row per procedure for a flight that graded procedures (the
   *  flight's columns repeated, then the procedure's: what failed, the verdict and what was late / missed) */
  csv(list: ProcAttempt[]): string {
    const head = ['date', 'student', 'mode', 'scenario', 'exercise', 'approach', 'acs', 'score', 'grade', 'failed_tasks', 'failures', 'duration_s', 'procedure', 'procedure_failure', 'procedure_mode', 'procedure_verdict', 'procedure_score', 'reaction_s', 'checklist_opened_s', 'items_done', 'late_items', 'missed_items', 'out_of_order_items', 'not_from_memory_items', 'procedure_outcome', 'first_note'];
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const s1 = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(Math.round(v * 10) / 10));
    const rows: string[] = [head.join(',')];
    for (const a of list) {
      const base = [a.date, a.student, a.mode, a.scenario, a.exercise ?? '', a.approach, a.acs, a.graded === false ? '' : a.score, a.graded === false ? '' : a.grade, a.failedTasks.join('; '), a.failures.join('; '), Math.round(a.durationSec)];
      const procs = Array.isArray(a.procedures) ? a.procedures : [];
      if (!procs.length) {
        rows.push([...base, ...Array(head.length - base.length).fill('')].map(q).join(','));
        continue;
      }
      for (const r of procs) {
        const m = procedureSummary(r);
        rows.push([...base, r.title, r.failure, r.mode ?? '', r.verdict, r.score, s1(r.reactionS), s1(r.checklistOpenedS), `${m.done}/${m.total}`, m.late.join('; '), m.missed.join('; '), m.outOfOrder.join('; '), m.notFromMemory.join('; '), r.outcome, r.notes[0] ?? ''].map(q).join(','));
      }
    }
    return rows.join('\n');
  },
};

